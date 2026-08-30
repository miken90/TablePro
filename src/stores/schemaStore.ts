import { create } from "zustand";
import { useConnectionStore } from "./connectionStore";
import type { RoutineCatalog, TableInfo } from "../types/schema";
import type { ColumnInfo } from "../types/query";
import type { DriverCapabilities } from "../types/capability";
import { DEFAULT_CAPABILITIES } from "../types/capability";
import * as commands from "../ipc/commands";
import { classifyError } from "../ipc/error";
import { recordMetadataLoad } from "../metrics/local-metrics";

export interface FkRef {
  refTable: string;
  refColumn: string;
  refSchema?: string;
}

interface SchemaState {
  tables: TableInfo[];
  columnsByTable: Map<string, ColumnInfo[]>;
  // FK metadata: tableName → { columnName → FkRef }
  fkMap: Record<string, Record<string, FkRef>>;
  databases: string[];
  selectedDatabase: string | null;
  schemas: string[];
  currentSchema: string | null;
  routineCatalog: RoutineCatalog | null;
  isLoading: boolean;
  error: string | null;
  /** Capabilities of the currently connected driver. */
  capabilities: DriverCapabilities;

  // Actions
  setCapabilities: (capabilities: DriverCapabilities) => void;
  fetchDatabases: (sessionId: string) => Promise<void>;
  fetchSchema: (sessionId: string) => Promise<void>;
  fetchRoutines: (sessionId: string) => Promise<void>;
  fetchSchemas: (sessionId: string) => Promise<void>;
  /**
   * The post-connect metadata load: tables, routines, and schemas, fetched
   * concurrently instead of one after another. `engine` is the driver id,
   * used only for the metrics record — pass `null` when it isn't known.
   */
  loadInitialMetadata: (sessionId: string, engine: string | null) => Promise<void>;
  fetchColumns: (sessionId: string, tableName: string, schema?: string) => Promise<ColumnInfo[]>;
  fetchForeignKeysForTable: (sessionId: string, table: string, schema?: string) => Promise<void>;
  selectDatabase: (sessionId: string, db: string | null) => Promise<void>;
  setCurrentSchema: (schema: string | null) => void;
  clearSchema: () => void;
}

/**
 * Reload the object tree for whichever connection is selected.
 *
 * The single entry point for "refresh the schema": the F5 editor binding, the
 * command palette entry and the post-import refresh all call this. Those three
 * used to dispatch a `tablepro:refresh-schema` window event that nothing
 * listened for, so two of them silently did nothing.
 *
 * Returns false when there is nothing connected to refresh.
 */
export function refreshActiveSchema(): boolean {
  const connectionId = useConnectionStore.getState().selectedConnectionId;
  if (!connectionId) return false;
  const sessionId = useConnectionStore.getState().getSessionId(connectionId);
  if (!sessionId) return false;
  void useSchemaStore.getState().fetchSchema(sessionId);
  return true;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Runs `task`, timed, without ever rejecting — a failure comes back as a
 *  `PromiseSettledResult` so independent fetches never block each other. */
async function timed<T>(task: () => Promise<T>): Promise<{ ms: number; result: PromiseSettledResult<T> }> {
  const start = nowMs();
  const [result] = await Promise.allSettled([task()]);
  return { ms: Math.round(nowMs() - start), result };
}

const SCHEMA_LOAD_TIMEOUT_MS = 15_000;

function fetchTablesTimed(sessionId: string) {
  return timed(() =>
    Promise.race([
      commands.fetchTables(sessionId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Schema loading timed out")), SCHEMA_LOAD_TIMEOUT_MS),
      ),
    ]),
  );
}

function fetchRoutinesTimed(sessionId: string, supportsSqlEditor: boolean) {
  if (!supportsSqlEditor) {
    return Promise.resolve({ ms: 0, result: { status: "fulfilled", value: null } as PromiseSettledResult<RoutineCatalog | null> });
  }
  return timed(() => commands.fetchRoutines(sessionId));
}

function fetchSchemasTimed(sessionId: string, supportsSchemas: boolean) {
  if (!supportsSchemas) {
    return Promise.resolve({ ms: 0, result: { status: "fulfilled", value: [] } as PromiseSettledResult<string[]> });
  }
  return timed(() => commands.fetchSchemas(sessionId));
}

/** Only the selected connection's own metadata load may write to the store —
 *  a slow load for a connection the user has since switched away from (a
 *  different connection, or a fresh session on the same one after a
 *  reconnect) is dropped instead of overwriting newer data. */
function isSessionStillActive(sessionId: string): boolean {
  const { selectedConnectionId, sessionIds } = useConnectionStore.getState();
  if (!selectedConnectionId) return false;
  return sessionIds.get(selectedConnectionId) === sessionId;
}

// Concurrent metadata loads share one in-flight counter so `isLoading` stays
// true for as long as any of them are running, regardless of which finishes
// first — a per-call `isLoading: false` would otherwise flicker it off while
// a sibling fetch is still in flight.
let inFlightLoads = 0;

function beginLoad(set: (partial: Partial<SchemaState>) => void): void {
  inFlightLoads++;
  set({ isLoading: true, error: null });
}

function endLoad(set: (partial: Partial<SchemaState>) => void): void {
  inFlightLoads = Math.max(0, inFlightLoads - 1);
  if (inFlightLoads === 0) set({ isLoading: false });
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  tables: [],
  columnsByTable: new Map(),
  fkMap: {},
  databases: [],
  selectedDatabase: null,
  schemas: [],
  currentSchema: null,
  routineCatalog: null,
  isLoading: false,
  error: null,
  capabilities: DEFAULT_CAPABILITIES,

  setCapabilities: (capabilities) => set({ capabilities }),

  fetchDatabases: async (sessionId) => {
    beginLoad(set);
    try {
      const databases = await commands.fetchDatabases(sessionId);
      if (!isSessionStillActive(sessionId)) return;
      set({ databases });
    } catch (err) {
      if (!isSessionStillActive(sessionId)) return;
      const classified = classifyError(err);
      set({ error: classified.hint ? `${classified.message} — ${classified.hint}` : classified.message });
    } finally {
      endLoad(set);
    }
  },

  // Tables and routines run concurrently — a routines failure (e.g. a
  // permission-restricted database) never blocks tables, and vice versa.
  fetchSchema: async (sessionId) => {
    beginLoad(set);
    try {
      const supportsSqlEditor = get().capabilities.supportsSqlEditor;
      const [tablesTimed, routinesTimed] = await Promise.all([
        fetchTablesTimed(sessionId),
        fetchRoutinesTimed(sessionId, supportsSqlEditor),
      ]);

      if (!isSessionStillActive(sessionId)) return;

      if (tablesTimed.result.status === "fulfilled") {
        set({ tables: tablesTimed.result.value });
      } else {
        const classified = classifyError(tablesTimed.result.reason);
        set({ error: classified.hint ? `${classified.message} — ${classified.hint}` : classified.message });
      }
      set({
        routineCatalog:
          supportsSqlEditor && routinesTimed.result.status === "fulfilled" ? routinesTimed.result.value : null,
      });
    } finally {
      endLoad(set);
    }
  },

  fetchSchemas: async (sessionId) => {
    // Skip for drivers that don't support schemas
    if (!get().capabilities.supportsSchemas) {
      set({ schemas: [] });
      return;
    }
    const { result } = await fetchSchemasTimed(sessionId, true);
    if (!isSessionStillActive(sessionId)) return;
    // Non-PostgreSQL drivers will fail silently — schemas stay empty
    set({ schemas: result.status === "fulfilled" ? result.value : [] });
  },

  fetchRoutines: async (sessionId) => {
    try {
      const routineCatalog = await commands.fetchRoutines(sessionId);
      if (!isSessionStillActive(sessionId)) return;
      set({ routineCatalog });
    } catch (err) {
      if (!isSessionStillActive(sessionId)) return;
      const classified = classifyError(err);
      set({ error: classified.hint ? `${classified.message} — ${classified.hint}` : classified.message, routineCatalog: null });
    }
  },

  loadInitialMetadata: async (sessionId, engine) => {
    const t0 = nowMs();
    beginLoad(set);
    try {
      const supportsSqlEditor = get().capabilities.supportsSqlEditor;
      const supportsSchemas = get().capabilities.supportsSchemas;

      const [tablesTimed, routinesTimed, schemasTimed] = await Promise.all([
        fetchTablesTimed(sessionId),
        fetchRoutinesTimed(sessionId, supportsSqlEditor),
        fetchSchemasTimed(sessionId, supportsSchemas),
      ]);

      if (!isSessionStillActive(sessionId)) return;

      if (tablesTimed.result.status === "fulfilled") {
        set({ tables: tablesTimed.result.value });
      } else {
        const classified = classifyError(tablesTimed.result.reason);
        set({ error: classified.hint ? `${classified.message} — ${classified.hint}` : classified.message });
      }
      set({
        routineCatalog:
          supportsSqlEditor && routinesTimed.result.status === "fulfilled" ? routinesTimed.result.value : null,
        schemas: supportsSchemas && schemasTimed.result.status === "fulfilled" ? schemasTimed.result.value : [],
      });

      recordMetadataLoad({
        engine,
        tablesMs: tablesTimed.ms,
        routinesMs: supportsSqlEditor ? routinesTimed.ms : null,
        schemasMs: supportsSchemas ? schemasTimed.ms : null,
        totalMs: Math.round(nowMs() - t0),
      });
    } finally {
      endLoad(set);
    }
  },

  fetchColumns: async (sessionId, tableName, schema) => {
    const existing = get().columnsByTable.get(tableName);
    if (existing) return existing;
    const cols = await commands.fetchColumns(sessionId, tableName, schema);
    set((s) => {
      const columnsByTable = new Map(s.columnsByTable);
      columnsByTable.set(tableName, cols);
      return { columnsByTable };
    });
    return cols;
  },

  fetchForeignKeysForTable: async (sessionId, table, schema) => {
    // Skip if already cached
    if (get().fkMap[table]) return;
    try {
      const fks = await commands.fetchForeignKeys(sessionId, table, schema);
      const tableMap: Record<string, FkRef> = {};
      for (const fk of fks) {
        tableMap[fk.column] = {
          refTable: fk.referencedTable,
          refColumn: fk.referencedColumn,
          refSchema: schema,
        };
      }
      set((s) => ({ fkMap: { ...s.fkMap, [table]: tableMap } }));
    } catch {
      // Non-fatal: FK metadata not available for this driver/table
    }
  },

  selectDatabase: async (sessionId, db) => {
    if (!db) {
      set({
        selectedDatabase: null,
        tables: [],
        columnsByTable: new Map(),
        schemas: [],
        currentSchema: null,
        routineCatalog: null,
      });
      return;
    }
    set({
      isLoading: true,
      error: null,
      tables: [],
      columnsByTable: new Map(),
      schemas: [],
      currentSchema: null,
      routineCatalog: null,
    });
    try {
      await commands.switchDatabase(sessionId, db);
      if (!isSessionStillActive(sessionId)) {
        set({ isLoading: false });
        return;
      }
      set({ selectedDatabase: db });
      // Tables/routines and schemas are independent once the database switch
      // lands — neither needs to wait for the other.
      await Promise.allSettled([get().fetchSchema(sessionId), get().fetchSchemas(sessionId)]);
    } catch (err) {
      const classified = classifyError(err);
      set({ error: classified.hint ? `${classified.message} — ${classified.hint}` : classified.message, isLoading: false });
    }
  },

  setCurrentSchema: (schema) => {
    set({ currentSchema: schema, columnsByTable: new Map() });
  },

  clearSchema: () =>
    set({
      tables: [],
      columnsByTable: new Map(),
      fkMap: {},
      databases: [],
      selectedDatabase: null,
      schemas: [],
      currentSchema: null,
      routineCatalog: null,
      capabilities: DEFAULT_CAPABILITIES,
    }),
}));
