import { create } from "zustand";
import type { TableInfo } from "../types/schema";
import type { ColumnInfo } from "../types/query";
import * as commands from "../ipc/commands";
import { extractErrorMessage } from "../ipc/error";

interface SchemaState {
  tables: TableInfo[];
  columnsByTable: Map<string, ColumnInfo[]>;
  databases: string[];
  selectedDatabase: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDatabases: (sessionId: string) => Promise<void>;
  fetchSchema: (sessionId: string) => Promise<void>;
  fetchColumns: (sessionId: string, tableName: string, schema?: string) => Promise<ColumnInfo[]>;
  selectDatabase: (sessionId: string, db: string | null) => Promise<void>;
  clearSchema: () => void;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  tables: [],
  columnsByTable: new Map(),
  databases: [],
  selectedDatabase: null,
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
      set({ tables, isLoading: false });
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false });
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

  selectDatabase: async (sessionId, db) => {
    if (!db) {
      set({ selectedDatabase: null, tables: [], columnsByTable: new Map() });
      return;
    }
    set({ isLoading: true, error: null, tables: [], columnsByTable: new Map() });
    try {
      await commands.switchDatabase(sessionId, db);
      set({ selectedDatabase: db });
      const tables = await commands.fetchTables(sessionId);
      set({ tables, isLoading: false });
    } catch (err) {
      set({ error: extractErrorMessage(err), isLoading: false });
    }
  },

  clearSchema: () =>
    set({ tables: [], columnsByTable: new Map(), databases: [], selectedDatabase: null }),
}));
