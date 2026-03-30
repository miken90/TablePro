export interface CellCoord {
  row: number; // logical row ID (can be negative for inserted rows)
  col: number; // visible column index
}

export type SelectionMode = 'cell' | 'range' | 'row' | 'column';

export interface GridSelection {
  active: CellCoord | null;
  anchor: CellCoord | null;
  extent: CellCoord | null;
  mode: SelectionMode | null;
}

export interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const EMPTY_SELECTION: GridSelection = {
  active: null,
  anchor: null,
  extent: null,
  mode: null,
};

export function getNormalizedRect(
  sel: GridSelection,
  getDisplayIdx: (rowId: number) => number,
  rowCount: number,
  colCount: number,
): SelectionRect | null {
  if (!sel.mode || !sel.active) return null;

  if (sel.mode === 'cell') {
    const r = getDisplayIdx(sel.active.row);
    return { top: r, bottom: r, left: sel.active.col, right: sel.active.col };
  }

  if (sel.mode === 'range' && sel.anchor && sel.extent) {
    const r1 = getDisplayIdx(sel.anchor.row);
    const r2 = getDisplayIdx(sel.extent.row);
    return {
      top: Math.min(r1, r2),
      bottom: Math.max(r1, r2),
      left: Math.min(sel.anchor.col, sel.extent.col),
      right: Math.max(sel.anchor.col, sel.extent.col),
    };
  }

  if (sel.mode === 'row' && sel.anchor && sel.extent) {
    const r1 = getDisplayIdx(sel.anchor.row);
    const r2 = getDisplayIdx(sel.extent.row);
    return { top: Math.min(r1, r2), bottom: Math.max(r1, r2), left: 0, right: colCount - 1 };
  }

  if (sel.mode === 'column' && sel.anchor && sel.extent) {
    return {
      top: 0,
      bottom: rowCount - 1,
      left: Math.min(sel.anchor.col, sel.extent.col),
      right: Math.max(sel.anchor.col, sel.extent.col),
    };
  }

  return null;
}

export function isCellInRect(rect: SelectionRect, displayRow: number, col: number): boolean {
  return displayRow >= rect.top && displayRow <= rect.bottom && col >= rect.left && col <= rect.right;
}

export function isCellActive(sel: GridSelection, rowId: number, col: number): boolean {
  return sel.active !== null && sel.active.row === rowId && sel.active.col === col;
}

export function getSelectedRowIds(
  sel: GridSelection,
  getDisplayIdx: (rowId: number) => number,
  getLogicalId: (displayIdx: number) => number,
  rowCount: number,
  colCount: number,
): Set<number> {
  const rect = getNormalizedRect(sel, getDisplayIdx, rowCount, colCount);
  if (!rect) return new Set();

  if (sel.mode === 'column') {
    const ids = new Set<number>();
    for (let i = 0; i < rowCount; i++) ids.add(getLogicalId(i));
    return ids;
  }

  const ids = new Set<number>();
  for (let i = rect.top; i <= rect.bottom; i++) ids.add(getLogicalId(i));
  return ids;
}
