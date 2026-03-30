import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GridHeader } from './grid-header';
import { GridRow } from './grid-row';
import { useSettingsStore } from '../../stores/settingsStore';
import { useColumnWidths, FIXED_COLS_WIDTH } from './hooks/use-column-widths';
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
}: DataGridProps) {
  const nullDisplay = useSettingsStore(s => s.settings.nullDisplay);
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = result.rows;

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

  return (
    <div
      className="relative h-full overflow-hidden"
      style={isDragging ? { userSelect: 'none' } : undefined}
      role="grid"
      aria-label="Query results"
      aria-rowcount={rows.length}
    >
      <div ref={parentRef} className="h-full overflow-auto focus:outline-none" tabIndex={0} onKeyDown={handleGridKeyDown}>
        <div style={{ minWidth: totalContentWidth }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex border-b border-border-subtle bg-surface">
            <div className="w-10 flex-shrink-0 px-1 py-1.5 text-center text-text-muted text-xs border-r border-border-subtle select-none">
              #
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
                  selection={selection}
                  selectionRect={selectionRect}
                  onRowClick={(e) => {
                    if (!onRowSelect) return;
                    if (e.shiftKey) onRowSelect(logicalRowId, 'range');
                    else if (e.ctrlKey || e.metaKey) onRowSelect(logicalRowId, 'toggle');
                    else onRowSelect(logicalRowId, 'single');
                  }}
                  onCellMouseDown={(colIdx, e) => {
                    if (e.button !== 0) return;
                    if (e.shiftKey) { onExtendTo?.(logicalRowId, colIdx); } else { onBeginDrag?.(logicalRowId, colIdx); }
                    parentRef.current?.focus();
                  }}
                  onCellMouseEnter={(colIdx) => { if (isDragging) onUpdateDrag?.(logicalRowId, colIdx); }}
                  onRowHeaderClick={(e) => {
                    if (e.shiftKey) { onRowSelect?.(logicalRowId, 'range'); } else { onRowHeaderClick?.(logicalRowId); }
                    parentRef.current?.focus();
                  }}
                  onCellDoubleClick={(colIdx) => onCellDoubleClick?.(logicalRowId, colIdx)}
                  onCellCommit={onCellCommit ? (colIdx, val) => onCellCommit(logicalRowId, colIdx, val) : undefined}
                  onCellCancel={onCellCancel}
                  onCellContextMenu={onCellContextMenu ? (event, colIdx, cellValue, row) => onCellContextMenu(event, logicalRowId, colIdx, cellValue, row) : undefined}
                  enumValuesByColumn={enumValuesByColumn}
                  onFkNavigate={onFkNavigate}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
