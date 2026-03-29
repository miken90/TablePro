import React, { useCallback, useEffect, useRef } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { GridSelection } from '../grid-selection';
import type { ColumnInfo } from '../../../types/query';
import { DEFAULT_COL_WIDTH, FIXED_COLS_WIDTH } from './use-column-widths';

export const ROW_HEIGHT = 28;

interface UseGridKeyboardProps {
  editingCell?: { rowIdx: number; colIdx: number } | null;
  selection?: GridSelection;
  visibleColumns: ColumnInfo[];
  resolvedWidths: Record<string, number>;
  isDragging?: boolean;
  rowIds?: number[];
  parentRef: React.RefObject<HTMLDivElement>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  onMoveActive?: (dx: number, dy: number) => void;
  onMoveNext?: () => void;
  onMovePrev?: () => void;
  onMoveToFirst?: () => void;
  onMoveToLast?: () => void;
  onMoveToRowStart?: () => void;
  onMoveToRowEnd?: () => void;
  onMoveActivePage?: (direction: number, visibleRowCount: number) => void;
  onStartEditingActive?: () => void;
  onClearSelection?: () => void;
  onExtendActive?: (dx: number, dy: number) => void;
  onSelectAll?: () => void;
}

interface UseGridKeyboardReturn {
  handleGridKeyDown: (e: React.KeyboardEvent) => void;
}

export function useGridKeyboard({
  editingCell,
  selection,
  visibleColumns,
  resolvedWidths,
  isDragging,
  rowIds,
  parentRef,
  virtualizer,
  onMoveActive,
  onMoveNext,
  onMovePrev,
  onMoveToFirst,
  onMoveToLast,
  onMoveToRowStart,
  onMoveToRowEnd,
  onMoveActivePage,
  onStartEditingActive,
  onClearSelection,
  onExtendActive,
  onSelectAll,
}: UseGridKeyboardProps): UseGridKeyboardReturn {

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editingCell) return;

    switch (e.key) {
      case 'ArrowUp':
        if (e.shiftKey) { onExtendActive?.(0, -1); } else { onMoveActive?.(0, -1); }
        break;
      case 'ArrowDown':
        if (e.shiftKey) { onExtendActive?.(0, 1); } else { onMoveActive?.(0, 1); }
        break;
      case 'ArrowLeft':
        if (e.shiftKey) { onExtendActive?.(-1, 0); } else { onMoveActive?.(-1, 0); }
        break;
      case 'ArrowRight':
        if (e.shiftKey) { onExtendActive?.(1, 0); } else { onMoveActive?.(1, 0); }
        break;
      case 'Tab':
        if (e.shiftKey) { onMovePrev?.(); } else { onMoveNext?.(); }
        break;
      case 'Enter': onStartEditingActive?.(); break;
      case 'Escape': onClearSelection?.(); break;
      case 'Home':
        if (e.ctrlKey || e.metaKey) { onMoveToFirst?.(); } else { onMoveToRowStart?.(); }
        break;
      case 'End':
        if (e.ctrlKey || e.metaKey) { onMoveToLast?.(); } else { onMoveToRowEnd?.(); }
        break;
      case 'PageUp': {
        const visibleCount = parentRef.current ? Math.floor(parentRef.current.clientHeight / ROW_HEIGHT) : 10;
        onMoveActivePage?.(-1, visibleCount);
        break;
      }
      case 'PageDown': {
        const visibleCount = parentRef.current ? Math.floor(parentRef.current.clientHeight / ROW_HEIGHT) : 10;
        onMoveActivePage?.(1, visibleCount);
        break;
      }
      case 'a':
        if (e.ctrlKey || e.metaKey) { onSelectAll?.(); break; }
        return;
      default: return;
    }
    e.preventDefault();
  }, [editingCell, onMoveActive, onExtendActive, onMoveNext, onMovePrev, onMoveToFirst, onMoveToLast, onMoveToRowStart, onMoveToRowEnd, onMoveActivePage, onStartEditingActive, onClearSelection, onSelectAll, parentRef]);

  // Auto-scroll active cell into view
  useEffect(() => {
    if (!selection?.active || !parentRef.current) return;

    const displayIdx = rowIds
      ? rowIds.indexOf(selection.active.row)
      : selection.active.row;
    if (displayIdx >= 0) {
      virtualizer.scrollToIndex(displayIdx, { align: 'auto' });
    }

    const colIdx = selection.active.col;
    const scrollEl = parentRef.current;
    let left = FIXED_COLS_WIDTH;
    for (let i = 0; i < colIdx; i++) {
      const col = visibleColumns[i];
      left += col ? (resolvedWidths[col.name] ?? DEFAULT_COL_WIDTH) : DEFAULT_COL_WIDTH;
    }
    const colWidth = visibleColumns[colIdx] ? (resolvedWidths[visibleColumns[colIdx].name] ?? DEFAULT_COL_WIDTH) : DEFAULT_COL_WIDTH;
    const right = left + colWidth;
    if (left < scrollEl.scrollLeft + FIXED_COLS_WIDTH) {
      scrollEl.scrollLeft = left - FIXED_COLS_WIDTH;
    } else if (right > scrollEl.scrollLeft + scrollEl.clientWidth) {
      scrollEl.scrollLeft = right - scrollEl.clientWidth;
    }
  }, [selection?.active?.row, selection?.active?.col, visibleColumns, resolvedWidths, virtualizer, rowIds, parentRef]);

  // --- Drag auto-scroll ---
  const autoScrollRef = useRef<number | null>(null);
  const lastMouseYRef = useRef<number>(0);
  const lastMouseXRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
      return;
    }

    const EDGE_ZONE = 40;
    const SCROLL_SPEED = 3;

    const tick = () => {
      const el = parentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mouseY = lastMouseYRef.current;
      const mouseX = lastMouseXRef.current;

      if (mouseY < rect.top + EDGE_ZONE) {
        el.scrollTop = Math.max(0, el.scrollTop - SCROLL_SPEED);
      } else if (mouseY > rect.bottom - EDGE_ZONE) {
        el.scrollTop += SCROLL_SPEED;
      }

      if (mouseX < rect.left + EDGE_ZONE + FIXED_COLS_WIDTH) {
        el.scrollLeft = Math.max(0, el.scrollLeft - SCROLL_SPEED);
      } else if (mouseX > rect.right - EDGE_ZONE) {
        el.scrollLeft += SCROLL_SPEED;
      }

      autoScrollRef.current = requestAnimationFrame(tick);
    };

    autoScrollRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };
  }, [isDragging, parentRef]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      lastMouseYRef.current = e.clientY;
      lastMouseXRef.current = e.clientX;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [isDragging]);

  return { handleGridKeyDown };
}
