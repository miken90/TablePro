import { create } from "zustand";
import { toast } from "sonner";
import type { QueryResult } from "../types/query";
import type { ExplainResult } from "../ipc/commands";
import * as commands from "../ipc/commands";
import { classifyError } from "../ipc/error";
import { useConnectionStore } from "./connectionStore";
import { useEditorStore } from "./editorStore";
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
  /** EXPLAIN query result */
  explainResult: ExplainResult | null;
  /** Whether an EXPLAIN query is in flight */
  isExplaining: boolean;

  // Actions
  setQueryText: (text: string) => void;
  setActiveConnection: (id: string | null) => void;
  execute: (sessionId: string, sql: string, params?: string[], safeModeLevel?: number) => Promise<void>;
  confirmSafeCheck: () => Promise<void>;
  cancelSafeCheck: () => void;
  cancel: (sessionId: string) => Promise<void>;
  clearResult: () => void;
  runExplain: (sessionId: string, sql: string) => Promise<void>;
}

function getDisplayRowCount(result: QueryResult): number {
  return result.affectedRows > 0 ? result.affectedRows : result.rows.length;
}

function isSelectLikeQuery(sql: string): boolean {
  const normalized = sql.trimStart().toLowerCase();

  if (
    normalized.startsWith("select") ||
    normalized.startsWith("show") ||
    normalized.startsWith("describe") ||
    normalized.startsWith("explain") ||
    normalized.startsWith("pragma")
  ) {
    return true;
  }

  if (!normalized.startsWith("with")) {
    return false;
  }

  const cteMatch = normalized.match(/\)\s*(select|show|describe|explain|pragma|insert|update|delete)\b/);
  if (!cteMatch) {
    return false;
  }

  return ["select", "show", "describe", "explain", "pragma"].includes(cteMatch[1]);
}

function getSuccessDescription(sql: string, result: QueryResult, elapsedMs: number): string {
  if (result.affectedRows > 0) {
    return `${result.affectedRows} row${result.affectedRows !== 1 ? "s" : ""} affected in ${elapsedMs}ms`;
  }

  if (result.rows.length > 0) {
    return `${result.rows.length} row${result.rows.length !== 1 ? "s" : ""} in ${elapsedMs}ms`;
  }

  if (isSelectLikeQuery(sql)) {
    return `0 rows in ${elapsedMs}ms`;
  }

  return `Statement executed in ${elapsedMs}ms`;
}

export function resolveActiveQueryConnectionId(): string | undefined {
  const { activeTabId, tabs } = useEditorStore.getState();
  const tabConnectionId = tabs.find((tab) => tab.id === activeTabId)?.connectionId;
  if (tabConnectionId) {
    return tabConnectionId;
  }

  const { selectedConnectionId } = useConnectionStore.getState();
  return selectedConnectionId ?? undefined;
}

export function resolveActiveQuerySessionId(): string | undefined {
  const connectionState = useConnectionStore.getState();
  const { activeTabId, tabs } = useEditorStore.getState();
  const tabConnectionId = tabs.find((tab) => tab.id === activeTabId)?.connectionId;

  if (tabConnectionId) {
    return connectionState.getSessionId(tabConnectionId);
  }

  const selectedConnectionId = connectionState.selectedConnectionId;
  if (!selectedConnectionId) {
    return undefined;
  }

  return connectionState.getSessionId(selectedConnectionId);
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
    const displayRowCount = getDisplayRowCount(result);

    set({ result, isExecuting: false, durationMs: elapsedMs });
    useQueryLogStore.getState().update(logId, {
      status: "success",
      durationMs: elapsedMs,
      rowCount: displayRowCount,
    });
    commands.historyRecord(sql, null, elapsedMs, displayRowCount, "success").catch(() => {});
    toast.dismiss(loadingId);
    toast.success("Query executed", {
      description: getSuccessDescription(sql, result, elapsedMs),
    });
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const classified = classifyError(err);
    const errorMsg = classified.message;
    const description = classified.hint
      ? `${errorMsg}\n${classified.hint}`
      : errorMsg;
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
    toast.error("Query failed", { description, duration: Infinity });
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
  explainResult: null,
  isExplaining: false,

  setQueryText: (text) => set({ queryText: text }),

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  execute: async (sessionId, sql, params, safeModeLevel = 0) => {
    const check = checkSafeMode(sql, safeModeLevel);

    if (check.blocked) {
      const message = "Read-only mode: write queries are blocked (Safe Mode Level 5).";
      set({ error: message });
      toast.error("Query blocked", { description: message });
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

  clearResult: () => set({ result: null, error: null, durationMs: null, explainResult: null }),

  runExplain: async (sessionId, sql) => {
    set({ isExplaining: true, explainResult: null, error: null });
    const loadingId = toast.loading("Analyzing query plan...");
    try {
      const result = await commands.explainQuery(sessionId, sql);
      set({ explainResult: result, isExplaining: false });
      toast.dismiss(loadingId);
      toast.success("Explain complete");
    } catch (err) {
      const classified = classifyError(err);
      const description = classified.hint
        ? `${classified.message}\n${classified.hint}`
        : classified.message;
      set({ isExplaining: false, error: classified.message });
      toast.dismiss(loadingId);
      toast.error("Explain failed", { description, duration: Infinity });
    }
  },
}));
