/**
 * queryResultStore — columnar streaming result mirror.
 *
 * Phase 2 of the gridex/RAM optimization (see
 * `plans/260429-1430-gridex-optimization/phase-02-ram-optimization.md`).
 *
 * Backend (`commands/query_streaming.rs`) emits a typed `QueryChunk` stream
 * over a Tauri `Channel<QueryChunk>`. This store accumulates the chunks into
 * a single `ColumnarResultWire`. The backend applies the same
 * `storeMaxRows` cap before it copies the result, so in practice truncation
 * is decided there and reported on the terminal `done` chunk; the store keeps
 * its own cap as a second line of defence. Either way `truncated=true` is set
 * (with `truncatedBy` naming the cap) so the UI can show a banner.
 *
 * Rendering (Task 6) reads the `columnar` field directly. The store is
 * additive — it does **not** populate the legacy row-major `queryStore`.
 *
 * Wire shape (matches `query_streaming.rs` + `driver-common::columnar`):
 *   - `QueryChunk` enum: `tag = "kind"`, `rename_all = "camelCase"` →
 *     lowercase variants `meta|rows|done|err` with camelCase fields.
 *   - `ColumnInfo` (`models/query.rs` + `driver-common`): camelCase.
 *   - `ColumnarResult` (`driver-common/columnar.rs`): snake_case fields
 *     (`row_count`, `affected_rows`, `execution_time_ms`,
 *     `total_row_count`) — no `rename_all`.
 *   - `ColumnData`: `tag = "kind", content = "values"` → PascalCase
 *     variants `Ints|Floats|Strings|Bools|Bytes|Json|Null`.
 */

import { create } from "zustand";
import type { ColumnInfo } from "../types/query";
import { useSettingsStore } from "./settingsStore";

// ── Wire types ──────────────────────────────────────────────────────────────

export type ColumnDataWire =
  | { kind: "Ints"; values: (number | null)[] }
  | { kind: "Floats"; values: (number | null)[] }
  | { kind: "Strings"; values: (string | null)[] }
  | { kind: "Bools"; values: (boolean | null)[] }
  | { kind: "Bytes"; values: (number[] | null)[] }
  | { kind: "Json"; values: (unknown | null)[] }
  | { kind: "Null"; values: number };

export interface ColumnarResultWire {
  columns: ColumnInfo[];
  data: ColumnDataWire[];
  row_count: number;
  affected_rows?: number;
  execution_time_ms?: number;
  truncated?: boolean;
  total_row_count?: number | null;
}

export type QueryChunk =
  | {
      kind: "meta";
      columns: ColumnInfo[];
      totalEstimate: number;
      generation: number;
    }
  | {
      kind: "rows";
      idx: number;
      chunk: ColumnarResultWire;
      generation: number;
    }
  | {
      kind: "done";
      rowsTotal: number;
      ms: number;
      generation: number;
      /** Backend applied its row cap; `totalRows` is the pre-cap count. */
      truncated: boolean;
      totalRows: number;
    }
  | { kind: "err"; message: string; generation: number };

// ── Column slice / append helpers ───────────────────────────────────────────

/** Return the first `n` items of a column, preserving its variant kind. */
function sliceColumn(col: ColumnDataWire, n: number): ColumnDataWire {
  if (n <= 0) {
    return emptyOf(col);
  }
  switch (col.kind) {
    case "Null":
      return { kind: "Null", values: Math.min(col.values, n) };
    case "Ints":
    case "Floats":
    case "Strings":
    case "Bools":
    case "Bytes":
    case "Json":
      return { kind: col.kind, values: col.values.slice(0, n) } as ColumnDataWire;
  }
}

function emptyOf(col: ColumnDataWire): ColumnDataWire {
  switch (col.kind) {
    case "Null":
      return { kind: "Null", values: 0 };
    default:
      return { kind: col.kind, values: [] } as ColumnDataWire;
  }
}

/**
 * Append `incoming` values onto `prev` for one column. Both columns MUST
 * share the same `kind`; if they don't (driver inferred different types
 * across chunks — should not happen because the backend re-uses the
 * inferred schema for every chunk), we coerce to the existing variant by
 * leaving `prev` unchanged for safety.
 */
function appendColumn(
  prev: ColumnDataWire,
  incoming: ColumnDataWire,
): ColumnDataWire {
  if (prev.kind !== incoming.kind) {
    return prev;
  }
  if (prev.kind === "Null" && incoming.kind === "Null") {
    return { kind: "Null", values: prev.values + incoming.values };
  }
  // Both are array-backed and same kind.
  const merged = (prev.values as unknown[]).concat(
    incoming.values as unknown[],
  );
  return { kind: prev.kind, values: merged } as ColumnDataWire;
}

// ── Store ───────────────────────────────────────────────────────────────────

interface QueryResultState {
  /** Server-side query identity. New stream → new generation. */
  generation: number;
  /** Accumulated columnar result (null until first `meta`). */
  columnar: ColumnarResultWire | null;
  /** Driver-reported total row count (from `meta.totalEstimate`). */
  totalRowsServer: number;
  /** True once either cap fired — the backend's or this store's. */
  truncated: boolean;
  /** Which cap dropped rows, or null when nothing was dropped. */
  truncatedBy: "backend" | "store" | null;
  /** True between `beginStream` and terminal `done`/`err` chunk. */
  streaming: boolean;
  /** Set when an `err` chunk arrives. */
  streamError: string | null;
  /** Total elapsed ms from `done` chunk (null until done). */
  durationMs: number | null;

  // Actions
  beginStream: (generation: number) => void;
  appendChunk: (chunk: QueryChunk) => void;
  clearStream: () => void;
}

const INITIAL: Omit<
  QueryResultState,
  "beginStream" | "appendChunk" | "clearStream"
> = {
  generation: 0,
  columnar: null,
  totalRowsServer: 0,
  truncated: false,
  truncatedBy: null,
  streaming: false,
  streamError: null,
  durationMs: null,
};

export const useQueryResultStore = create<QueryResultState>((set, get) => ({
  ...INITIAL,

  beginStream: (generation) =>
    set({
      generation,
      columnar: null,
      totalRowsServer: 0,
      truncated: false,
      truncatedBy: null,
      streaming: true,
      streamError: null,
      durationMs: null,
    }),

  appendChunk: (chunk) => {
    const state = get();

    // Drop stale chunks from a superseded query.
    if (chunk.generation !== state.generation) {
      return;
    }

    switch (chunk.kind) {
      case "meta": {
        // Initialise empty columnar result with the announced schema.
        const empty: ColumnarResultWire = {
          columns: chunk.columns,
          data: chunk.columns.map(() => ({ kind: "Strings", values: [] })),
          row_count: 0,
          affected_rows: 0,
          execution_time_ms: 0,
          truncated: false,
          total_row_count: null,
        };
        set({ columnar: empty, totalRowsServer: chunk.totalEstimate });
        return;
      }

      case "rows": {
        if (state.truncated) {
          return; // Already at cap → drop.
        }
        const cap = useSettingsStore.getState().settings.storeMaxRows;
        const incoming = chunk.chunk;
        // First chunk after meta sets the schema (variant kinds), so
        // subsequent appends preserve column types.
        const base: ColumnarResultWire =
          state.columnar ?? {
            columns: incoming.columns,
            data: incoming.data.map((d) => emptyOf(d)),
            row_count: 0,
          };

        const current = base.row_count;
        const headroom = Math.max(0, cap - current);
        if (headroom === 0) {
          set({ truncated: true, truncatedBy: state.truncatedBy ?? "store" });
          return;
        }

        const take = Math.min(incoming.row_count, headroom);
        const willTruncate = incoming.row_count > headroom;

        // Slice incoming to `take` rows then append per-column.
        const slicedIncoming = incoming.data.map((c) => sliceColumn(c, take));
        // First rows after meta: meta initialised placeholder "Strings"
        // columns of length 0. Replace with the incoming variants so
        // subsequent appends preserve the real column types.
        const mergedData =
          current === 0
            ? slicedIncoming
            : base.data.length === slicedIncoming.length
              ? base.data.map((prev, i) => appendColumn(prev, slicedIncoming[i]))
              : // Schema mismatch (row_count>0 but column count changed):
                // keep prior data, no-op.
                base.data;

        const merged: ColumnarResultWire = {
          columns: base.columns.length ? base.columns : incoming.columns,
          data: mergedData,
          row_count: current + take,
        };

        set({
          columnar: merged,
          truncated: willTruncate,
          truncatedBy: willTruncate ? (state.truncatedBy ?? "store") : state.truncatedBy,
        });
        return;
      }

      case "done": {
        // The backend caps the result before it copies it, so a truncation it
        // reports is authoritative — the store's own cap never sees the
        // dropped rows.
        set({
          streaming: false,
          durationMs: chunk.ms,
          truncated: state.truncated || chunk.truncated,
          totalRowsServer: chunk.totalRows,
          truncatedBy: state.truncatedBy ?? (chunk.truncated ? "backend" : null),
        });
        return;
      }

      case "err": {
        set({ streaming: false, streamError: chunk.message });
        return;
      }
    }
  },

  clearStream: () => set({ ...INITIAL }),
}));
