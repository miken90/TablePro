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
    const startMs = Date.now();
    try {
      const result = await commands.executeQuery(sessionId, sql, params);
      set({ result, isExecuting: false });

      // Record to query history (fire-and-forget — don't block UI on failure)
      const elapsedMs = Date.now() - startMs;
      commands.historyRecord(sql, null, elapsedMs, result.rows.length, 'success').catch(() => {});
    } catch (err) {
      const elapsedMs = Date.now() - startMs;
      set({
        error: extractErrorMessage(err),
        isExecuting: false,
      });
      commands.historyRecord(sql, null, elapsedMs, 0, 'error').catch(() => {});
    }
  },

  cancel: async (sessionId) => {
    await commands.cancelQuery(sessionId);
    set({ isExecuting: false });
  },

  clearResult: () => set({ result: null, error: null }),
}));
