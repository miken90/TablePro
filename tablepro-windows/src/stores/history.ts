import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry } from "../types/history";

interface HistoryState {
  entries: HistoryEntry[];
  searchText: string;
  isLoading: boolean;

  setSearchText: (text: string) => void;
  fetchRecent: (limit?: number) => Promise<void>;
  search: (text: string, limit?: number) => Promise<void>;
  clearAll: () => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  saveQuery: (
    query: string,
    database: string,
    connectionName: string,
    executionTimeMs: number,
    rowCount: number,
    status: string,
  ) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, _get) => ({
  entries: [],
  searchText: "",
  isLoading: false,

  setSearchText: (text) => set({ searchText: text }),

  fetchRecent: async (limit = 50) => {
    set({ isLoading: true });
    try {
      const entries = await invoke<HistoryEntry[]>("get_recent_queries", { limit });
      set({ entries });
    } catch {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },

  search: async (text, limit = 50) => {
    set({ isLoading: true, searchText: text });
    try {
      const entries = await invoke<HistoryEntry[]>("search_query_history", {
        searchText: text,
        limit,
        offset: 0,
      });
      set({ entries });
    } catch {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },

  clearAll: async () => {
    try {
      await invoke("clear_query_history");
      set({ entries: [] });
    } catch {
      // ignore
    }
  },

  deleteEntry: async (id) => {
    try {
      await invoke("delete_history_entry", { id });
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    } catch {
      // ignore
    }
  },

  saveQuery: async (query, database, connectionName, executionTimeMs, rowCount, status) => {
    try {
      await invoke("save_query_history", {
        query,
        database,
        connectionName,
        executionTimeMs,
        rowCount,
        status,
      });
    } catch {
      // ignore - don't let history failures break the workflow
    }
  },
}));
