import { create } from "zustand";
import { toast } from "sonner";
import type { QueryResult } from "../types/query";
import * as commands from "../ipc/commands";
import { extractErrorMessage } from "../ipc/error";
import { useQueryLogStore } from "./queryLogStore";

// --- Safe mode helpers ---

const DESTRUCTIVE = /\b(DELETE|DROP|TRUNCATE|ALTER)\b/i;
const ALL_DML = /\b(INSERT|UPDATE|DELETE)\b/i;
const ALL_WRITE = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i;

export interface SafeCheckResult {
  blocked: boolean;
  needsConfirm: boolean;
  dangerType: string;
}

/** Returns safe mode check result for a given SQL and level. */
export function checkSafeMode(sql: string, level: number): SafeCheckResult {
  switch (level) {
    case 0:
      return { blocked: false, needsConfirm: false, dangerType: "" };
    case 1:
      if (DESTRUCTIVE.test(sql)) {
        console.warn("[SafeMode/Silent] Destructive query detected:", sql.slice(0, 80));
      }
      return { blocked: false, needsConfirm: false, dangerType: "" };
    case 2:
      if (DESTRUCTIVE.test(sql)) {
        return { blocked: false, needsConfirm: true, dangerType: "destructive" };
      }
      return { blocked: false, needsConfirm: false, dangerType: "" };
    case 3:
      if (ALL_DML.test(sql) || DESTRUCTIVE.test(sql)) {
        return { blocked: false, needsConfirm: true, dangerType: "dml_ddl" };
      }
      return { blocked: false, needsConfirm: false, dangerType: "" };
    case 4:
      if (ALL_DML.test(sql) || DESTRUCTIVE.test(sql)) {
        return { blocked: false, needsConfirm: true, dangerType: "safe_mode" };
      }
      return { blocked: false, needsConfirm: false, dangerType: "" };
    case 5:
      if (ALL_WRITE.test(sql)) {
        return { blocked: true, needsConfirm: false, dangerType: "read_only" };
      }
      return { blocked: false, needsConfirm: false, dangerType: "" };
    default:
      return { blocked: false, needsConfirm: false, dangerType: "" };
  }
}

// --- Store ---

export interface PendingSafeCheck {
  sessionId: string;
  sql: string;
  params?: string[];
  level: number;
  dangerType: string;
}

interface QueryState {
  queryText: string;
  result: QueryResult | null;
  isExecuting: boolean;
  error: string | null;
  activeConnectionId: string | null;
  /** Milliseconds the last query took (set on success or error) */
  durationMs: number | null;
  /** Set when safe mode requires confirmation before executing */
  pendingSafeCheck: PendingSafeCheck | null;

  // Actions
  setQueryText: (text: string) => void;
  setActiveConnection: (id: string | null) => void;
  execute: (sessionId: string, sql: string, params?: string[], safeModeLevel?: number) => Promise<void>;
  confirmSafeCheck: () => Promise<void>;
  cancelSafeCheck: () => void;
  cancel: (sessionId: string) => Promise<void>;
  clearResult: () => void;
}

async function runQuery(
  set: (state: Partial<QueryState>) => void,
  sessionId: string,
  sql: string,
  params?: string[],
): Promise<void> {
  set({ isExecuting: true, error: null, result: null, durationMs: null, activeConnectionId: sessionId });
  const startMs = Date.now();
  const loadingId = toast.loading("Executing query...");
  const logId = useQueryLogStore.getState().add({
    sql,
    source: "editor",
    status: "running",
    timestamp: startMs,
  });
  try {
    const result = await commands.executeQuery(sessionId, sql, params);
    const elapsedMs = Date.now() - startMs;
    set({ result, isExecuting: false, durationMs: elapsedMs });
    useQueryLogStore.getState().update(logId, {
      status: "success",
      durationMs: elapsedMs,
      rowCount: result.rows.length,
    });
    commands.historyRecord(sql, null, elapsedMs, result.rows.length, "success").catch(() => {});
    toast.dismiss(loadingId);
    toast.success("Query executed", {
      description: `${result.rows.length} row${result.rows.length !== 1 ? "s" : ""} in ${elapsedMs}ms`,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const errorMsg = extractErrorMessage(err);
    set({
      error: errorMsg,
      isExecuting: false,
      durationMs: elapsedMs,
    });
    useQueryLogStore.getState().update(logId, {
      status: "error",
      durationMs: elapsedMs,
      error: errorMsg,
    });
    commands.historyRecord(sql, null, elapsedMs, 0, "error").catch(() => {});
    toast.dismiss(loadingId);
    toast.error("Query failed", { description: errorMsg, duration: Infinity });
  }
}

export const useQueryStore = create<QueryState>((set, get) => ({
  queryText: "",
  result: null,
  isExecuting: false,
  error: null,
  activeConnectionId: null,
  durationMs: null,
  pendingSafeCheck: null,

  setQueryText: (text) => set({ queryText: text }),

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  execute: async (sessionId, sql, params, safeModeLevel = 0) => {
    const check = checkSafeMode(sql, safeModeLevel);

    if (check.blocked) {
      set({ error: "Read-only mode: write queries are blocked (Safe Mode Level 5)." });
      return;
    }

    if (check.needsConfirm) {
      set({
        pendingSafeCheck: {
          sessionId,
          sql,
          params,
          level: safeModeLevel,
          dangerType: check.dangerType,
        },
      });
      return;
    }

    await runQuery(set, sessionId, sql, params);
  },

  confirmSafeCheck: async () => {
    const pending = get().pendingSafeCheck;
    if (!pending) return;
    set({ pendingSafeCheck: null });
    await runQuery(set, pending.sessionId, pending.sql, pending.params);
  },

  cancelSafeCheck: () => {
    set({ pendingSafeCheck: null });
  },

  cancel: async (sessionId) => {
    await commands.cancelQuery(sessionId);
    set({ isExecuting: false });
  },

  clearResult: () => set({ result: null, error: null, durationMs: null }),
}));
