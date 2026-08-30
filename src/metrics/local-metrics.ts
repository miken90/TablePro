/**
 * Local behavioural metrics.
 *
 * Writes one JSON object per line to `%LOCALAPPDATA%\TablePro\logs\metrics.jsonl`
 * so a slow or heavy session can be diagnosed from data instead of memory.
 * The file never leaves the machine — there is no network call, no service,
 * no SDK here, and the backend command it uses only appends to a local file.
 *
 * Schema and field meanings: `docs/development/local-metrics.md`. Bump
 * `SCHEMA_VERSION` when a field changes meaning.
 *
 * Cost control:
 *   - one IPC call per query (and one per session), never per chunk or row;
 *   - payload size is estimated from a bounded row sample, not by walking the
 *     result;
 *   - every record carries `overheadMs`, the time spent assembling it, so the
 *     instrumentation's own cost is visible in the data it produces.
 */

import * as commands from "../ipc/commands";

export const SCHEMA_VERSION = 1;

/** Rows sampled to estimate the payload size of a result. */
const BYTES_SAMPLE_ROWS = 100;

export type QueryStatus = "ok" | "error" | "cancelled";

export interface QueryMetricsInput {
  /** Stream generation — unique per run within a session. */
  gen: number;
  status: QueryStatus;
  /** Driver id (`postgres`, `mysql`, …) or null when it cannot be resolved. */
  engine: string | null;
  rows: number;
  cols: number;
  chunks: number;
  /** Row-major rows, used only to sample the payload size. */
  sampleSource: (string | null)[][];
  /** `ms` reported by the backend's terminal chunk. */
  backendMs: number | null;
  /** Wall clock from dispatch to the store commit, on the UI thread. */
  totalMs: number;
  /** Duration of the synchronous `materializeStringRows` pass. */
  materializeMs: number | null;
  truncated: boolean;
  truncatedBy: "backend" | "store" | null;
  /** Rows the driver produced before any cap. */
  totalRows: number;
  tabs: number;
  connections: number;
  /** Present only on `status: "error"`. */
  error?: string;
}

interface JsonRecord {
  [key: string]: unknown;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Chromium exposes JS heap usage; other engines do not. Omit when absent. */
function jsHeapMb(): number | undefined {
  const mem = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
  const used = mem?.usedJSHeapSize;
  if (typeof used !== "number") return undefined;
  return Math.round(used / 1024 / 1024);
}

/**
 * Estimate the serialized size of a result from at most
 * [`BYTES_SAMPLE_ROWS`] rows. Returns the estimate and the sample size that
 * produced it, so a reader can tell how much to trust it.
 */
export function estimatePayloadBytes(
  rows: (string | null)[][],
  totalRows: number,
  sampleSize: number = BYTES_SAMPLE_ROWS,
): { bytes: number; bytesSampled: number } {
  const sampled = Math.min(rows.length, sampleSize);
  if (sampled === 0) return { bytes: 0, bytesSampled: 0 };
  let sampleBytes = 0;
  for (let r = 0; r < sampled; r++) {
    sampleBytes += JSON.stringify(rows[r]).length;
  }
  return {
    bytes: Math.round((sampleBytes / sampled) * totalRows),
    bytesSampled: sampled,
  };
}

function emit(record: JsonRecord): void {
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    return;
  }
  // Fire and forget: a metrics write must never fail a query.
  void commands.metricsAppend(line).catch(() => {});
}

/** Record one query execution. Safe to call from a hot path. */
export function recordQuery(input: QueryMetricsInput): void {
  try {
    const t0 = nowMs();
    const { bytes, bytesSampled } = estimatePayloadBytes(
      input.sampleSource,
      input.rows,
    );
    const record: JsonRecord = {
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      event: "query",
      status: input.status,
      gen: input.gen,
      engine: input.engine,
      rows: input.rows,
      cols: input.cols,
      chunks: input.chunks,
      bytes,
      bytesSampled,
      backendMs: input.backendMs,
      totalMs: Math.round(input.totalMs),
      materializeMs:
        input.materializeMs === null ? null : Math.round(input.materializeMs),
      truncated: input.truncated,
      truncatedBy: input.truncatedBy,
      totalRows: input.totalRows,
      tabs: input.tabs,
      connections: input.connections,
    };
    const heap = jsHeapMb();
    if (heap !== undefined) record.jsHeapMb = heap;
    if (input.error) record.error = input.error.slice(0, 500);

    // Measured after everything above, so it covers the whole assembly cost.
    record.overheadMs = Number((nowMs() - t0).toFixed(3));
    emit(record);
  } catch {
    // Instrumentation failure must stay invisible to the user.
  }
}

/**
 * Record one `firstPaintMs` sample for a query, taken on the frame after the
 * result was committed to the store. Split from [`recordQuery`] because it
 * can only be known one frame later; join the two on `gen`.
 */
export function recordFirstPaint(gen: number, startedAtMs: number): void {
  // No animation frames outside a browser (unit tests, headless runs) — and
  // no paint to measure either, so nothing is recorded rather than guessed.
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    emit({
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      event: "query.paint",
      gen,
      firstPaintMs: Math.round(nowMs() - startedAtMs),
    });
  });
}

export interface MetadataLoadMetricsInput {
  /** Driver id (`postgres`, `mysql`, …), or null when it cannot be resolved. */
  engine: string | null;
  tablesMs: number;
  /** `null` when the driver doesn't support routines — not measured, not skipped-as-zero. */
  routinesMs: number | null;
  /** `null` when the driver doesn't support schemas — not measured, not skipped-as-zero. */
  schemasMs: number | null;
  /** Wall clock for the whole load: tables, routines, and schemas together. */
  totalMs: number;
}

/**
 * Record one post-connect metadata load — tables, routines, and schemas,
 * fetched concurrently once a session has a database selected. No
 * `connectionId`: only the engine and timings, matching every other record
 * in this file.
 */
export function recordMetadataLoad(input: MetadataLoadMetricsInput): void {
  try {
    emit({
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      event: "metadata",
      engine: input.engine,
      tablesMs: Math.round(input.tablesMs),
      routinesMs: input.routinesMs === null ? null : Math.round(input.routinesMs),
      schemasMs: input.schemasMs === null ? null : Math.round(input.schemasMs),
      totalMs: Math.round(input.totalMs),
      parallel: true,
    });
  } catch {
    // Instrumentation failure must stay invisible to the user.
  }
}

/**
 * Record session startup. Called after `createRoot().render()`; the value is
 * captured on the second animation frame, i.e. after the first painted frame.
 */
export function recordSessionStart(appVersion?: string): void {
  const emitStart = () => {
    const record: JsonRecord = {
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      event: "session",
      appVersion: appVersion ?? null,
      startupMs: Math.round(nowMs()),
    };
    const heap = jsHeapMb();
    if (heap !== undefined) record.jsHeapMb = heap;
    emit(record);
  };
  if (typeof requestAnimationFrame !== "function") {
    emitStart();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(emitStart));
}
