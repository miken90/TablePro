/**
 * Columnar render helpers (Task 6 — gridex RAM optimization phase 2).
 *
 * Materializes the column-major `ColumnarResultWire` produced by the
 * streaming `queryResultStore` into row-major arrays for rendering, with a
 * hard 500-row DOM cap independent of virtualization scroll position.
 *
 * Generation gating pattern (consume in async render-prep effects):
 *
 *   const generation = useQueryResultStore(s => s.generation);
 *   useEffect(() => {
 *     let cancelled = false;
 *     const myGen = generation;
 *     void someAsyncRenderPrep().then(() => {
 *       if (cancelled) return;
 *       if (myGen !== useQueryResultStore.getState().generation) return;
 *       // commit work
 *     });
 *     return () => { cancelled = true; };
 *   }, [generation]);
 */

import type {
  ColumnDataWire,
  ColumnarResultWire,
} from "../../stores/queryResultStore";

export const RENDER_ROW_CAP = 500;
export const CELL_TRUNCATE_LIMIT = 80;
export const EXPLAIN_COL_MAX_PX = 4000;

export function readCell(col: ColumnDataWire, idx: number): unknown {
  if (col.kind === "Null") return null;
  return (col.values as unknown[])[idx] ?? null;
}

export function materializeRows(
  cr: ColumnarResultWire | null,
  max: number = RENDER_ROW_CAP,
): unknown[][] {
  if (!cr) return [];
  const limit = Math.min(cr.row_count, max);
  const out: unknown[][] = new Array(limit);
  for (let r = 0; r < limit; r++) {
    out[r] = cr.data.map((col) => readCell(col, r));
  }
  return out;
}

export function isExplainResult(
  columns: { name: string }[] | undefined | null,
): boolean {
  return !!columns && columns.length === 1 && columns[0].name === "QUERY PLAN";
}

export function truncateCell(value: unknown, isExplain = false): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (isExplain) return s;
  if (s.length <= CELL_TRUNCATE_LIMIT) return s;
  return s.slice(0, CELL_TRUNCATE_LIMIT - 3) + "…";
}

export function explainColumnWidth(rows: unknown[][]): number {
  let maxLen = 0;
  for (const row of rows) {
    const v = row[0];
    const s = typeof v === "string" ? v : v == null ? "" : String(v);
    if (s.length > maxLen) maxLen = s.length;
  }
  return Math.min(maxLen * 7 + 24, EXPLAIN_COL_MAX_PX);
}
