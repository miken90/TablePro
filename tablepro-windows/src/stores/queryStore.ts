import { create } from "zustand";
import type { QueryResult } from "../types/query";
import * as commands from "../ipc/commands";
import { extractErrorMessage } from "../ipc/error";

interface QueryState {
  queryText: string;
  result: QueryResult | null;
  isExecuting: boolean;
  error: string | null;
  activeConnectionId: string | null;

  // Actions
  setQueryText: (text: string) => void;
  setActiveConnection: (id: string | null) => void;
  execute: (sessionId: string, sql: string, params?: string[]) => Promise<void>;
  cancel: (sessionId: string) => Promise<void>;
  clearResult: () => void;
}

export const useQueryStore = create<QueryState>((set) => ({
  queryText: "",
  result: null,
  isExecuting: false,
  error: null,
  activeConnectionId: null,

  setQueryText: (text) => set({ queryText: text }),

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  execute: async (sessionId, sql, params) => {
    set({ isExecuting: true, error: null, result: null, activeConnectionId: sessionId });
    try {
      const result = await commands.executeQuery(sessionId, sql, params);
      set({ result, isExecuting: false });
    } catch (err) {
      set({
        error: extractErrorMessage(err),
        isExecuting: false,
      });
    }
  },

  cancel: async (sessionId) => {
    await commands.cancelQuery(sessionId);
    set({ isExecuting: false });
  },

  clearResult: () => set({ result: null, error: null }),
}));
