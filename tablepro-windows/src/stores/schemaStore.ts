import { create } from "zustand";
import type { RoutineCatalog, TableInfo } from "../types/schema";
import type { ColumnInfo } from "../types/query";
import * as commands from "../ipc/commands";
import { extractErrorMessage } from "../ipc/error";

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

  // Actions
  fetchDatabases: (sessionId: string) => Promise<void>;
  fetchSchema: (sessionId: string) => Promise<void>;
  fetchRoutines: (sessionId: string) => Promise<void>;
  fetchSchemas: (sessionId: string) => Promise<void>;
  fetchColumns: (sessionId: string, tableName: string, schema?: string) => Promise<ColumnInfo[]>;
  fetchForeignKeysForTable: (sessionId: string, table: string, schema?: string) => Promise<void>;
  selectDatabase: (sessionId: string, db: string | null) => Promise<void>;
  setCurrentSchema: (schema: string | null) => void;
  clearSchema: () => void;
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

  fetchDatabases: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      const databases = await commands.fetchDatabases(sessionId);
      set({ databases, isLoading: false });
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false });
    }
  },

  fetchSchema: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      const tables = await commands.fetchTables(sessionId);
      let routineCatalog: RoutineCatalog | null = null;

      try {
        routineCatalog = await commands.fetchRoutines(sessionId);
      } catch {
        // Routine metadata should not block table loading.
      }

      set({ tables, routineCatalog, isLoading: false });
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false });
    }
  },

  fetchSchemas: async (sessionId) => {
    try {
      const schemas = await commands.fetchSchemas(sessionId);
      set({ schemas });
    } catch {
      // Non-PostgreSQL drivers will fail silently — schemas stay empty
      set({ schemas: [] });
    }
  },

  fetchRoutines: async (sessionId) => {
    try {
      const routineCatalog = await commands.fetchRoutines(sessionId);
      set({ routineCatalog });
    } catch (err) {
      set({ error: extractErrorMessage(err), routineCatalog: null });
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
      set({ selectedDatabase: db });
      await get().fetchSchema(sessionId);
      // Fetch schemas after switching database (fire-and-forget)
      get().fetchSchemas(sessionId);
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false });
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
    }),
}));
