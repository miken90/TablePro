import { create } from "zustand";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { QueryResult } from "../types/query";
import type { ExplainResult } from "../ipc/commands";
import * as commands from "../ipc/commands";
import { classifyError, extractErrorMessage } from "../ipc/error";
import { useConnectionStore } from "./connectionStore";
import { useEditorStore } from "./editorStore";
import { useQueryLogStore } from "./queryLogStore";
import {
  useQueryResultStore,
  type ColumnDataWire,
  type ColumnarResultWire,
  type QueryChunk,
} from "./queryResultStore";
import { useSettingsStore } from "./settingsStore";
import { recordFirstPaint, recordQuery, type QueryStatus } from "../metrics/local-metrics";
import type { CancelTarget } from "./tab-stream-registry";
import {
  cancelTabStream,
  mintStreamGeneration,
  registerTabStream,
  releaseTabStream,
  resolveCancelTarget,
} from "./tab-stream-registry";

/** Result of a Stop press: what the store actually did. */
export type CancelOutcome = "cancelled" | CancelTarget["kind"];

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
  /**
   * Set by the grid save path. Safe Mode there holds a write that is not a
   * query — confirming has to resume the save, not run the previewed SQL as
   * if the user had typed it into the editor.
   */
  onConfirm?: () => Promise<void>;
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
  /**
   * Set when a fresh plan arrives, cleared by whichever result panel selects
   * the Explain tab for it. The marker lives here rather than in a per-mount
   * ref so switching tabs — which remounts the panel — cannot yank an
   * unrelated tab back to Explain for a plan that was already shown.
   */
  explainSelectedAt: number | null;
  /** Whether an EXPLAIN query is in flight */
  isExplaining: boolean;

  // Actions
  setQueryText: (text: string) => void;
  setActiveConnection: (id: string | null) => void;
  execute: (sessionId: string, sql: string, params?: string[], safeModeLevel?: number) => Promise<void>;
  confirmSafeCheck: () => Promise<void>;
  cancelSafeCheck: () => void;
  /** Abort the run the UI is showing as in flight. Targets the tab that
   *  started it and the session it started on — never the active tab's.
   *  Returns what it did so the caller can explain an ambiguous Stop. */
  cancel: () => Promise<CancelOutcome>;
  clearResult: () => void;
  runExplain: (sessionId: string, sql: string) => Promise<void>;
}

function getDisplayRowCount(result: QueryResult): number {
  return result.affectedRows > 0 ? result.affectedRows : result.rows.length;
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

// --- Streaming dispatch (Phase 2 — gridex/RAM optimization) ---
//
// Replaces the legacy single-shot `execute_query` IPC with the streaming
// `execute_query_streaming` channel pipeline. Chunks land in the columnar
// `useQueryResultStore`; on terminal `done` we synthesize a row-major
// `QueryResult` mirror here so legacy readers (StatusBar, ExportDialog,
// query-announcer, sql-editor error subscribe) continue to work without
// modification. The data-grid render path consumes the columnar store
// directly via `result-panel.tsx` so the mirror is only used by callers
// that still want a `QueryResult` shape.
//
// Invariants:
//   • Channel.onmessage is wired BEFORE invoke() (Tauri spike rule §1).
//   • A new run cancels the prior in-flight stream OF THE SAME TAB only;
//     the per-run cancel handle is registered against that tab so external
//     `cancel()` reaches it and other tabs stay untouched.
//   • The owning tab key and the session id are captured when the run starts
//     and travel with the handle, so a later tab switch cannot redirect a
//     cancel to a different tab or a different database session.
//   • Every run mints a monotonic generation; stale chunks are dropped
//     in the columnar store.

/** Key identifying which tab owns a stream. Read once, at run start. Falls
 *  back to the session when no tab is active (Mongo/Redis panels, command
 *  palette runs). */
function streamKeyFor(sessionId: string): string {
  const { activeTabId } = useEditorStore.getState();
  return activeTabId ?? `session:${sessionId}`;
}

export { __resetTabStreams, __activeStreamKeys } from "./tab-stream-registry";

/** Materialize column-major data into row-major `(string | null)[][]`
 *  for back-compat with the legacy `QueryResult.rows` shape. */
function materializeStringRows(cr: ColumnarResultWire): (string | null)[][] {
  const out: (string | null)[][] = new Array(cr.row_count);
  for (let r = 0; r < cr.row_count; r++) {
    out[r] = cr.data.map((col) => readCellAsString(col, r));
  }
  return out;
}

function readCellAsString(col: ColumnDataWire, idx: number): string | null {
  if (col.kind === "Null") return null;
  const v = (col.values as unknown[])[idx];
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  // Bytes (number[]), Json (object/array) → stringify.
  return JSON.stringify(v);
}

async function runQuery(
  set: (state: Partial<QueryState>) => void,
  sessionId: string,
  sql: string,
  // `params` is unused by the streaming command (parameter binding lives
  // server-side via prepared statements, which the streaming pipeline
  // does not yet expose). Kept in signature for source-compat with
  // existing callers; if non-empty we log a warning.
  params?: string[],
): Promise<void> {
  if (params && params.length > 0) {
    console.warn("[queryStore] params ignored by streaming pipeline; use inline SQL");
  }

  // Cancel this tab's own prior in-flight stream before starting. Other
  // tabs' streams are left alone.
  const streamKey = streamKeyFor(sessionId);
  cancelTabStream(streamKey);

  set({
    isExecuting: true,
    error: null,
    result: null,
    durationMs: null,
    activeConnectionId: sessionId,
  });

  const startMs = Date.now();
  // High-resolution origin for the metrics record; `startMs` stays wall-clock
  // because the query log timestamps entries with it.
  const startedAt = performance.now();
  const logId = useQueryLogStore.getState().add({
    sql,
    source: "editor",
    status: "running",
    timestamp: startMs,
  });

  // Mint generation + reset columnar store.
  const gen = mintStreamGeneration();
  useQueryResultStore.getState().beginStream(gen);

  // Wire channel BEFORE invoke (spike rule §1).
  const channel = new Channel<QueryChunk>();
  let cancelled = false;
  let doneMs = 0;
  let streamErr: string | null = null;
  let chunkCount = 0;

  // The command's reply and the channel's chunks travel on two different IPC
  // paths. A chunk larger than Tauri's direct-eval limit is handed over by a
  // second round-trip, so `invoke` can resolve while the rows are still in
  // flight — and the channel releases messages in index order, so `done` is
  // held back with them. Finalizing on the resolved invoke therefore read a
  // store holding nothing but the column metadata and published a zero-row
  // result for a query that returned rows. The terminal chunk is the only
  // point at which every row this run will deliver is in the store.
  let markStreamTerminated: () => void = () => {};
  const streamTerminated = new Promise<void>((resolve) => {
    markStreamTerminated = resolve;
  });

  const cancelHandle = () => {
    if (cancelled) return;
    cancelled = true;
    // Nothing more will be consumed from this run, so stop waiting for its
    // terminal chunk.
    markStreamTerminated();
    // Always cancels the session this run started on, never the session of
    // whatever tab happens to be active when the user presses Stop.
    void invoke("cancel_query", { sessionId }).catch((err) => {
      // Best-effort by design: drivers with no cancel channel (SQL Server,
      // MongoDB, Redis) answer `Unsupported`. The local listener is detached
      // either way, so report and continue instead of failing the cancel.
      console.warn(
        `[queryStore] backend cancel for ${sessionId} failed: ${extractErrorMessage(err)}`,
      );
    });
  };
  registerTabStream({ generation: gen, ownerKey: streamKey, sessionId, cancel: cancelHandle });

  channel.onmessage = (chunk) => {
    if (cancelled) return;
    if (chunk.generation !== gen) return;
    if (chunk.kind === "rows") chunkCount++;
    if (chunk.kind === "done") doneMs = chunk.ms;
    if (chunk.kind === "err") streamErr = chunk.message;
    useQueryResultStore.getState().appendChunk(chunk);
    if (chunk.kind === "done" || chunk.kind === "err") markStreamTerminated();
  };

  const threshold = useSettingsStore.getState().settings.streamingThreshold;

  try {
    await invoke("execute_query_streaming", {
      sessionId,
      sql,
      threshold,
      generation: gen,
      channel,
    });
  } catch (err) {
    if (!cancelled && !streamErr) {
      streamErr = extractErrorMessage(err);
      useQueryResultStore.getState().appendChunk({
        kind: "err",
        message: streamErr,
        generation: gen,
      });
    }
    markStreamTerminated();
  }

  // A resolved command means the backend sent a terminal chunk; it may not
  // have reached the channel yet.
  await streamTerminated;

  // Clear this tab's slot only if it's still ours (a newer run in the same
  // tab may have replaced it).
  releaseTabStream(streamKey, cancelHandle);

  if (cancelled) {
    // User-initiated cancel: leave isExecuting false.
    set({ isExecuting: false, durationMs: Date.now() - startMs });
    useQueryLogStore.getState().update(logId, {
      status: "error",
      durationMs: Date.now() - startMs,
      error: "cancelled",
    });
    emitQueryMetrics("cancelled", {
      gen,
      chunkCount,
      startedAt,
      backendMs: null,
      materializeMs: null,
      rows: [],
    });
    return;
  }

  const elapsedMs = doneMs || Date.now() - startMs;

  if (streamErr) {
    const classified = classifyError(streamErr);
    const errorMsg = classified.message;
    set({ error: errorMsg, isExecuting: false, durationMs: elapsedMs });
    useQueryLogStore.getState().update(logId, {
      status: "error",
      durationMs: elapsedMs,
      error: errorMsg,
    });
    commands.historyRecord(sql, null, elapsedMs, 0, "error").catch(() => {});
    emitQueryMetrics("error", {
      gen,
      chunkCount,
      startedAt,
      backendMs: doneMs || null,
      materializeMs: null,
      rows: [],
      error: errorMsg,
    });
    return;
  }

  // Build legacy QueryResult mirror from the columnar store.
  // Rows are duplicated here for back-compat with non-grid readers
  // (StatusBar, ExportDialog, query-announcer). T7 follow-up should
  // migrate those readers to read columnar directly to drop the mirror.
  const resultStore = useQueryResultStore.getState();
  const columnar = resultStore.columnar;
  const materializeStart = performance.now();
  const materializedRows = columnar ? materializeStringRows(columnar) : [];
  const materializeMs = columnar ? performance.now() - materializeStart : null;
  const result: QueryResult = columnar
    ? {
        columns: columnar.columns,
        rows: materializedRows,
        affectedRows: columnar.affected_rows ?? 0,
        executionTimeMs: elapsedMs,
        truncated: resultStore.truncated || undefined,
        totalRowCount:
          resultStore.totalRowsServer && resultStore.truncated
            ? resultStore.totalRowsServer
            : undefined,
      }
    : { columns: [], rows: [], affectedRows: 0, executionTimeMs: elapsedMs };

  set({ result, isExecuting: false, durationMs: elapsedMs });

  const displayRowCount = getDisplayRowCount(result);
  useQueryLogStore.getState().update(logId, {
    status: "success",
    durationMs: elapsedMs,
    rowCount: displayRowCount,
  });
  commands
    .historyRecord(sql, null, elapsedMs, displayRowCount, "success")
    .catch(() => {});

  emitQueryMetrics("ok", {
    gen,
    chunkCount,
    startedAt,
    backendMs: doneMs || null,
    materializeMs,
    rows: materializedRows,
  });
  recordFirstPaint(gen, startedAt);
}

/** Assemble a metrics record from whatever the run produced. */
function emitQueryMetrics(
  status: QueryStatus,
  args: {
    gen: number;
    chunkCount: number;
    startedAt: number;
    backendMs: number | null;
    materializeMs: number | null;
    rows: (string | null)[][];
    error?: string;
  },
): void {
  const resultStore = useQueryResultStore.getState();
  const columnar = resultStore.columnar;
  const connectionId = resolveActiveQueryConnectionId();
  const connectionState = useConnectionStore.getState();
  const engine = connectionId
    ? (connectionState.connections.get(connectionId)?.config?.dbType ?? null)
    : null;

  recordQuery({
    gen: args.gen,
    status,
    engine,
    rows: columnar?.row_count ?? 0,
    cols: columnar?.columns.length ?? 0,
    chunks: args.chunkCount,
    sampleSource: args.rows,
    backendMs: args.backendMs,
    totalMs: performance.now() - args.startedAt,
    materializeMs: args.materializeMs,
    truncated: resultStore.truncated,
    truncatedBy: resultStore.truncatedBy,
    totalRows: resultStore.totalRowsServer,
    tabs: useEditorStore.getState().tabs.length,
    connections: connectionState.connections.size,
    error: args.error,
  });
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
  explainSelectedAt: null,
  isExplaining: false,

  setQueryText: (text) => set({ queryText: text }),

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  execute: async (sessionId, sql, params, safeModeLevel = 0) => {
    const check = checkSafeMode(sql, safeModeLevel);

    if (check.blocked) {
      const message = "Read-only mode: write queries are blocked (Safe Mode Level 5).";
      set({ error: message });
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
    if (pending.onConfirm) {
      await pending.onConfirm();
      return;
    }
    await runQuery(set, pending.sessionId, pending.sql, pending.params);
  },

  cancelSafeCheck: () => {
    set({ pendingSafeCheck: null });
  },

  cancel: async () => {
    // Resolve the run to abort from the registry, not from the active tab's
    // connection: the handle carries the tab that started it and the session
    // it runs on. The active tab's own run wins; a single run elsewhere is
    // unambiguous; several runs with none focused cancel nothing.
    const { activeTabId } = useEditorStore.getState();
    const target = resolveCancelTarget(activeTabId);
    if (target.kind !== "run") return target.kind;

    // One round-trip only. `cancel()` detaches the listener and issues the
    // backend cancel for the originating session, guarded so it fires once.
    // A second out-of-band `cancel_query` would risk landing on the
    // connection after the next statement had already started.
    target.stream.cancel();
    set({ isExecuting: false });
    return "cancelled";
  },

  clearResult: () => set({ result: null, error: null, durationMs: null, explainResult: null, explainSelectedAt: null }),

  runExplain: async (sessionId, sql) => {
    set({ isExplaining: true, explainResult: null, explainSelectedAt: null, error: null });
    try {
      const result = await commands.explainQuery(sessionId, sql);
      set({ explainResult: result, explainSelectedAt: Date.now(), isExplaining: false });
    } catch (err) {
      const classified = classifyError(err);
      set({ isExplaining: false, error: classified.message });
    }
  },
}));
