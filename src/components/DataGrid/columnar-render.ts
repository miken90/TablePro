/**
 * Columnar render helpers.
 *
 * The data grid is virtualized (`grid/data-grid.tsx` uses
 * `@tanstack/react-virtual`), so the number of rows in a result never
 * decided the number of DOM nodes. What a huge result *can* do is put a
 * multi-megabyte string into a single text node, so cells are sliced at
 * render time instead — see `truncateForRender`, applied in `GridRow`.
 *
 * The remaining helpers size the single-column EXPLAIN output, which is
 * laid out by content width rather than the fixed default.
 */

export const EXPLAIN_COL_MAX_PX = 4000;

/**
 * Characters of a cell value the grid will put in the DOM. Wide enough that
 * no realistic column (max auto-fit width is 600px ≈ 85 monospace chars)
 * shows a shortened value, small enough that a BLOB or a large JSON document
 * cannot create a multi-megabyte text node per visible row. The full value
 * stays in the result and is what the cell editor, copy, and export read.
 */
export const CELL_RENDER_LIMIT = 1000;

export function isExplainResult(
  columns: { name: string }[] | undefined | null,
): boolean {
  return !!columns && columns.length === 1 && columns[0].name === "QUERY PLAN";
}

/** Slice a cell value down to what is worth rendering. */
export function truncateForRender(
  value: string,
  limit: number = CELL_RENDER_LIMIT,
): string {
  if (value.length <= limit) return value;
  return value.slice(0, limit) + "…";
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
