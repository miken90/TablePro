import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface HistoryEntry {
  id: number;
  query: string;
  database: string | null;
  execution_time_ms: number;
  row_count: number;
  status: "success" | "error";
  timestamp: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  isLoading: boolean;

  // Actions
  fetchRecent: () => Promise<void>;
  search: (query: string) => Promise<void>;
  clearAll: () => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  isLoading: false,

  fetchRecent: async () => {
    set({ isLoading: true });
    try {
      const entries = await invoke<HistoryEntry[]>("history:fetch_recent");
      set({ entries, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  search: async (query) => {
    set({ isLoading: true });
    try {
      const entries = await invoke<HistoryEntry[]>("history:search", { query });
      set({ entries, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  clearAll: async () => {
    try {
      await invoke("history:clear_all");
      set({ entries: [] });
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  },

  deleteEntry: async (id) => {
    try {
      await invoke("history:delete_entry", { id });
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    } catch (err) {
      console.error("Failed to delete history entry:", err);
    }
  },
}));
