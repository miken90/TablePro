import { useState, useCallback, useEffect } from 'react';
import type { GridSelection } from '../grid-selection';

interface UseGridNavigationProps {
  selection: GridSelection;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  getDisplayIdx: (logicalId: number) => number;
  getLogicalRowId: (displayIdx: number) => number;
  displayRowCount: number;
  visibleColCount: number;
  tableName?: string;
  setEditingCell: React.Dispatch<React.SetStateAction<{ rowIdx: number; colIdx: number } | null>>;
}

export interface UseGridNavigationReturn {
  moveActive: (dx: number, dy: number) => void;
  moveNext: () => void;
  movePrev: () => void;
  moveToFirst: () => void;
  moveToLast: () => void;
  moveToRowStart: () => void;
  moveToRowEnd: () => void;
  moveActivePage: (direction: number, visibleRowCount: number) => void;
  startEditingActive: () => void;
  isDragging: boolean;
  extendTo: (rowId: number, col: number) => void;
  extendActive: (dx: number, dy: number) => void;
  beginDrag: (rowId: number, col: number) => void;
  updateDrag: (rowId: number, col: number) => void;
  endDrag: () => void;
  selectColumn: (col: number) => void;
  selectAll: () => void;
}

export function useGridNavigation({
  selection, setSelection, getDisplayIdx, getLogicalRowId,
  displayRowCount, visibleColCount, tableName, setEditingCell,
}: UseGridNavigationProps): UseGridNavigationReturn {

  const moveActive = useCallback((dx: number, dy: number) => {
    setSelection(prev => {
      const active = prev.active ?? { row: getLogicalRowId(0), col: 0 };
      const displayIdx = getDisplayIdx(active.row);
      const newDisplayIdx = Math.max(0, Math.min(displayRowCount - 1, displayIdx + dy));
      const newCol = Math.max(0, Math.min(visibleColCount - 1, active.col + dx));
      const newRowId = getLogicalRowId(newDisplayIdx);
      const coord = { row: newRowId, col: newCol };
      return { active: coord, anchor: coord, extent: coord, mode: 'cell' };
    });
  }, [getDisplayIdx, getLogicalRowId, displayRowCount, visibleColCount]);

  const moveNext = useCallback(() => {
    setSelection(prev => {
      const active = prev.active ?? { row: getLogicalRowId(0), col: 0 };
      let newCol = active.col + 1;
      let displayIdx = getDisplayIdx(active.row);
      if (newCol >= visibleColCount) {
        newCol = 0;
        displayIdx = Math.min(displayRowCount - 1, displayIdx + 1);
      }
      const newRowId = getLogicalRowId(displayIdx);
      const coord = { row: newRowId, col: newCol };
      return { active: coord, anchor: coord, extent: coord, mode: 'cell' };
    });
  }, [getDisplayIdx, getLogicalRowId, displayRowCount, visibleColCount]);

  const movePrev = useCallback(() => {
    setSelection(prev => {
      const active = prev.active ?? { row: getLogicalRowId(0), col: 0 };
      let newCol = active.col - 1;
      let displayIdx = getDisplayIdx(active.row);
      if (newCol < 0) {
        newCol = visibleColCount - 1;
        displayIdx = Math.max(0, displayIdx - 1);
      }
      const newRowId = getLogicalRowId(displayIdx);
      const coord = { row: newRowId, col: newCol };
      return { active: coord, anchor: coord, extent: coord, mode: 'cell' };
    });
  }, [getDisplayIdx, getLogicalRowId, displayRowCount, visibleColCount]);

  const moveToFirst = useCallback(() => {
    const coord = { row: getLogicalRowId(0), col: 0 };
    setSelection({ active: coord, anchor: coord, extent: coord, mode: 'cell' });
  }, [getLogicalRowId]);

  const moveToLast = useCallback(() => {
    const coord = { row: getLogicalRowId(displayRowCount - 1), col: visibleColCount - 1 };
    setSelection({ active: coord, anchor: coord, extent: coord, mode: 'cell' });
  }, [getLogicalRowId, displayRowCount, visibleColCount]);

  const moveToRowStart = useCallback(() => {
    setSelection(prev => {
      const active = prev.active ?? { row: getLogicalRowId(0), col: 0 };
      const coord = { row: active.row, col: 0 };
      return { active: coord, anchor: coord, extent: coord, mode: 'cell' };
    });
  }, [getLogicalRowId]);

  const moveToRowEnd = useCallback(() => {
    setSelection(prev => {
      const active = prev.active ?? { row: getLogicalRowId(0), col: 0 };
      const coord = { row: active.row, col: visibleColCount - 1 };
      return { active: coord, anchor: coord, extent: coord, mode: 'cell' };
    });
  }, [getLogicalRowId, visibleColCount]);

  const moveActivePage = useCallback((direction: number, visibleRowCount: number) => {
    setSelection(prev => {
      const active = prev.active ?? { row: getLogicalRowId(0), col: 0 };
      const displayIdx = getDisplayIdx(active.row);
      const newDisplayIdx = Math.max(0, Math.min(displayRowCount - 1, displayIdx + direction * visibleRowCount));
      const newRowId = getLogicalRowId(newDisplayIdx);
      const coord = { row: newRowId, col: active.col };
      return { active: coord, anchor: coord, extent: coord, mode: 'cell' };
    });
  }, [getDisplayIdx, getLogicalRowId, displayRowCount]);

  const startEditingActive = useCallback(() => {
    if (!selection.active || !tableName) return;
    setEditingCell({ rowIdx: selection.active.row, colIdx: selection.active.col });
  }, [selection.active, tableName]);

  // --- Range/extend selection ---
  const [isDragging, setIsDragging] = useState(false);

  const extendTo = useCallback((rowId: number, col: number) => {
    setSelection(prev => ({
      ...prev,
      extent: { row: rowId, col },
      active: { row: rowId, col },
      mode: 'range',
    }));
  }, []);

  const extendActive = useCallback((dx: number, dy: number) => {
    setSelection(prev => {
      if (!prev.active) return prev;
      const anchor = prev.anchor ?? prev.active;
      const extent = prev.extent ?? prev.active;
      const displayIdx = getDisplayIdx(extent.row);
      const newDisplayIdx = Math.max(0, Math.min(displayRowCount - 1, displayIdx + dy));
      const newCol = Math.max(0, Math.min(visibleColCount - 1, extent.col + dx));
      const newRowId = getLogicalRowId(newDisplayIdx);
      const newExtent = { row: newRowId, col: newCol };
      return { active: newExtent, anchor, extent: newExtent, mode: 'range' };
    });
  }, [getDisplayIdx, getLogicalRowId, displayRowCount, visibleColCount]);

  const beginDrag = useCallback((rowId: number, col: number) => {
    setIsDragging(true);
    const coord = { row: rowId, col };
    setSelection({ active: coord, anchor: coord, extent: coord, mode: 'range' });
  }, []);

  const updateDrag = useCallback((rowId: number, col: number) => {
    setSelection(prev => {
      if (!prev.anchor) return prev;
      return { ...prev, extent: { row: rowId, col }, active: { row: rowId, col }, mode: 'range' };
    });
  }, []);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setSelection(prev => {
      if (prev.mode === 'range' && prev.anchor && prev.extent &&
          prev.anchor.row === prev.extent.row && prev.anchor.col === prev.extent.col) {
        return { ...prev, mode: 'cell' };
      }
      return prev;
    });
  }, []);

  const selectColumn = useCallback((col: number) => {
    const anchor = { row: getLogicalRowId(0), col };
    const extent = { row: getLogicalRowId(displayRowCount - 1), col };
    setSelection({ active: anchor, anchor, extent, mode: 'column' });
  }, [getLogicalRowId, displayRowCount]);

  const selectAll = useCallback(() => {
    if (displayRowCount === 0 || visibleColCount === 0) return;
    const anchor = { row: getLogicalRowId(0), col: 0 };
    const extent = { row: getLogicalRowId(displayRowCount - 1), col: visibleColCount - 1 };
    setSelection({ active: anchor, anchor, extent, mode: 'range' });
  }, [getLogicalRowId, displayRowCount, visibleColCount]);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => endDrag();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [isDragging, endDrag]);

  return {
    moveActive, moveNext, movePrev, moveToFirst, moveToLast,
    moveToRowStart, moveToRowEnd, moveActivePage, startEditingActive,
    isDragging, extendTo, extendActive, beginDrag, updateDrag, endDrag,
    selectColumn, selectAll,
  };
}
