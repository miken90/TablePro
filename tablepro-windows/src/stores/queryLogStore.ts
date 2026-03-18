import { create } from "zustand";

export interface QueryLogEntry {
  id: number;
  sql: string;
  source: "editor" | "table-browse";
  durationMs?: number;
  rowCount?: number;
  status: "running" | "success" | "error";
  error?: string;
  timestamp: number;
}

interface QueryLogState {
  entries: QueryLogEntry[];
  add: (entry: Omit<QueryLogEntry, "id">) => number;
  update: (id: number, patch: Partial<QueryLogEntry>) => void;
  clear: () => void;
}

let nextId = 1;
const MAX_ENTRIES = 100;

export const useQueryLogStore = create<QueryLogState>((set) => ({
  entries: [],

  add: (entry) => {
    const id = nextId++;
    set((s) => ({
      entries: [{ ...entry, id }, ...s.entries].slice(0, MAX_ENTRIES),
    }));
    return id;
  },

  update: (id, patch) => {
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  clear: () => set({ entries: [] }),
}));
