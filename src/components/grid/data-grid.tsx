import React, { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GridHeader } from './grid-header';
import { GridRow } from './grid-row';
import { useSettingsStore } from '../../stores/settingsStore';
import { useColumnWidths } from './hooks/use-column-widths';
import { useGridKeyboard, ROW_HEIGHT } from './hooks/use-grid-keyboard';
import type { DataGridProps } from './data-grid-types';

export function DataGrid({
  result,
  pageOffset = 0,
  sorting = [],
  onSortChange,
  onCellDoubleClick,
  onCellCommit,
  onCellCancel,
  onCellContextMenu,
  selectedRows = new Set(),
  onRowSelect,
  selection,
  selectionRect,
  onRowHeaderClick,
  changedRows,
  editingCell,
  cellOverrideValues,
  enumValuesByColumn,
  fkColumns,
  onFkNavigate,
  rowIds,
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
  onExtendTo,
  onExtendActive,
  onBeginDrag,
  onUpdateDrag,
  isDragging,
  onSelectColumn,
  onSelectAll,
  scrollRef,
  sessionId,
  isTableMode,
}: DataGridProps) {
  const nullDisplay = useSettingsStore(s => s.settings.nullDisplay);
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = result.rows;

  // Sync external scrollRef with internal parentRef
  useEffect(() => {
    if (scrollRef && parentRef.current) {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = parentRef.current;
    }
  });

  const {
    visibleColumns, resolvedWidths, totalContentWidth,
    hiddenColumns, handleResizeStart, handleAutoFit, handleHideColumn,
  } = useColumnWidths({ result });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const { handleGridKeyDown } = useGridKeyboard({
    editingCell, selection, visibleColumns, resolvedWidths,
    isDragging, rowIds, parentRef, virtualizer,
    onMoveActive, onMoveNext, onMovePrev, onMoveToFirst, onMoveToLast,
    onMoveToRowStart, onMoveToRowEnd, onMoveActivePage,
    onStartEditingActive, onClearSelection, onExtendActive, onSelectAll,
  });

  // --- Stable callbacks (accept rowId from GridRow) ---
  const handleRowClick = useCallback((rowId: number, e: React.MouseEvent) => {
    if (!onRowSelect) return;
    if (e.shiftKey) onRowSelect(rowId, 'range');
    else if (e.ctrlKey || e.metaKey) onRowSelect(rowId, 'toggle');
    else onRowSelect(rowId, 'single');
  }, [onRowSelect]);

  const handleCellMouseDown = useCallback((rowId: number, colIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.shiftKey) { onExtendTo?.(rowId, colIdx); } else { onBeginDrag?.(rowId, colIdx); }
    parentRef.current?.focus();
  }, [onExtendTo, onBeginDrag]);

  const handleCellMouseEnter = useCallback((rowId: number, colIdx: number) => {
    if (isDragging) onUpdateDrag?.(rowId, colIdx);
  }, [isDragging, onUpdateDrag]);

  const handleRowHeaderClick = useCallback((rowId: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      onRowSelect?.(rowId, 'range');
    } else if (e.ctrlKey || e.metaKey) {
      onRowSelect?.(rowId, 'toggle');
    } else if (isTableMode) {
      // In table mode, checkbox click always toggles
      onRowSelect?.(rowId, 'toggle');
    } else {
      onRowHeaderClick?.(rowId);
    }
    parentRef.current?.focus();
  }, [onRowSelect, onRowHeaderClick, isTableMode]);

  const handleCellDblClick = useCallback((rowId: number, colIdx: number) => {
    onCellDoubleClick?.(rowId, colIdx);
  }, [onCellDoubleClick]);

  const handleCommit = useCallback((rowId: number, colIdx: number, val: string | null) => {
    onCellCommit?.(rowId, colIdx, val);
  }, [onCellCommit]);

  const handleContextMenu = useCallback((
    event: React.MouseEvent<HTMLDivElement>, rowId: number, colIdx: number,
    cellValue: string | null, row: (string | null)[],
  ) => {
    onCellContextMenu?.(event, rowId, colIdx, cellValue, row);
  }, [onCellContextMenu]);

  return (
    <div
      className="relative h-full overflow-hidden"
      style={isDragging ? { userSelect: 'none' } : undefined}
      role="grid"
      aria-label="Query results"
      aria-rowcount={rows.length}
    >
      <div ref={parentRef} className="h-full overflow-auto" tabIndex={0} onKeyDown={handleGridKeyDown}>
        <div style={{ minWidth: totalContentWidth }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-20 flex border-b border-border-subtle bg-surface">
            <div
              className="w-10 flex-shrink-0 px-1 py-1.5 flex items-center justify-center text-text-secondary text-xs border-r border-border-subtle select-none"
            >
              {isTableMode ? (
                <input
                  type="checkbox"
                  checked={selectedRows.size > 0 && selectedRows.size === rows.length}
                  ref={(el) => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < rows.length; }}
                  onChange={() => {
                    if (selectedRows.size === rows.length) onClearSelection?.();
                    else onSelectAll?.();
                  }}
                  className="w-3.5 h-3.5 accent-accent-blue cursor-pointer"
                  tabIndex={-1}
                  title="Select all rows"
                />
              ) : (
                '#'
              )}
            </div>
            <GridHeader
              columns={visibleColumns}
              columnWidths={resolvedWidths}
              sorting={sorting}
              onSortChange={onSortChange ?? (() => {})}
              onResizeStart={handleResizeStart}
              hiddenColumns={hiddenColumns}
              onHideColumn={handleHideColumn}
              onFilterColumn={() => {}}
              onAutoFit={handleAutoFit}
              onSelectColumn={onSelectColumn}
            />
          </div>

          {/* Virtual body */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const localIdx = virtualRow.index;
              const logicalRowId = rowIds?.[localIdx] ?? (pageOffset + localIdx);
              const displayRowNumber = pageOffset + localIdx + 1;

              // Derive per-row selection primitives (stable across renders when unchanged)
              const isActiveRow = selection?.active?.row === logicalRowId;
              const activeColIdx = isActiveRow ? (selection?.active?.col ?? null) : null;
              const selectionCols = selectionRect
                && localIdx >= selectionRect.top
                && localIdx <= selectionRect.bottom
                ? [selectionRect.left, selectionRect.right] as [number, number]
                : null;

              return (
                <GridRow
                  key={virtualRow.index}
                  rowIndex={logicalRowId}
                  displayRowIndex={localIdx}
                  rowNumber={displayRowNumber}
                  row={rows[localIdx]}
                  columns={visibleColumns}
                  columnWidths={resolvedWidths}
                  isSelected={selectedRows.has(logicalRowId)}
                  changeType={changedRows?.get(logicalRowId)}
                  cellOverrideValues={cellOverrideValues}
                  editingCell={editingCell?.rowIdx === logicalRowId ? editingCell : null}
                  nullDisplay={nullDisplay}
                  virtualTop={virtualRow.start}
                  fkColumns={fkColumns}
                  isActiveRow={isActiveRow}
                  activeColIdx={activeColIdx}
                  selectionCols={selectionCols}
                  onRowClick={handleRowClick}
                  onCellMouseDown={handleCellMouseDown}
                  onCellMouseEnter={handleCellMouseEnter}
                  onRowHeaderClick={handleRowHeaderClick}
                  onCellDoubleClick={handleCellDblClick}
                  onCellCommit={onCellCommit ? handleCommit : undefined}
                  onCellCancel={onCellCancel}
                  onCellContextMenu={onCellContextMenu ? handleContextMenu : undefined}
                  enumValuesByColumn={enumValuesByColumn}
                  onFkNavigate={onFkNavigate}
                  sessionId={sessionId}
                  isTableMode={isTableMode}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
