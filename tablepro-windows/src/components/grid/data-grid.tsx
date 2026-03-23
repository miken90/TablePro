import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { QueryResult } from '../../types/query';
import type { FkRef } from '../../stores/schemaStore';
import { GridHeader } from './grid-header';
import { GridRow } from './grid-row';
import { useSettingsStore } from '../../stores/settingsStore';

interface DataGridProps {
  result: QueryResult;
  pageOffset?: number;
  sorting?: SortingState;
  onSortChange?: (colName: string) => void;
  onCellDoubleClick?: (rowIdx: number, colIdx: number) => void;
  onCellCommit?: (rowIdx: number, colIdx: number, newValue: string | null) => void;
  onCellCancel?: () => void;
  onCellContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowIdx: number,
    colIdx: number,
    cellValue: string | null,
    row: (string | null)[],
  ) => void;
  selectedRows?: Set<number>;
  onRowSelect?: (rowIdx: number, mode: 'single' | 'range' | 'toggle') => void;
  changedRows?: Map<number, 'modified' | 'inserted' | 'deleted'>;
  editingCell?: { rowIdx: number; colIdx: number } | null;
  cellOverrideValues?: Map<string, string | null>;
  enumValuesByColumn?: Record<string, string[]>;
  fkColumns?: Record<string, FkRef>;
  onFkNavigate?: (refTable: string, refColumn: string, refSchema: string | undefined, value: string) => void;
  /** Show checkbox column for row selection. Default: true */
  showCheckboxes?: boolean;
}

const DEFAULT_COL_WIDTH = 120;
const MIN_COL_WIDTH = 80;
const MAX_AUTO_FIT_WIDTH = 600;
const ROW_HEIGHT = 28;
// w-10 = 2.5rem = 40px; checkbox (40) + row# (40) = 80px fixed
const FIXED_COLS_WIDTH = 80;

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
  changedRows,
  editingCell,
  cellOverrideValues,
  enumValuesByColumn,
  fkColumns,
  onFkNavigate,
  showCheckboxes = true,
}: DataGridProps) {
  const nullDisplay = useSettingsStore(s => s.settings.nullDisplay);
  const fixedColsWidth = showCheckboxes ? FIXED_COLS_WIDTH : 40; // 40 = row numbers only
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = result.rows;

  const visibleColumns = result.columns.filter(c => !hiddenColumns.has(c.name));

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // Column resize state
  const resizeRef = useRef<{ colName: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((colName: string, startX: number, startWidth: number) => {
    resizeRef.current = { colName, startX, startWidth };

    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.max(MIN_COL_WIDTH, resizeRef.current.startWidth + delta);
      setColumnWidths(prev => ({ ...prev, [resizeRef.current!.colName]: newWidth }));
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleAutoFit = useCallback((colName: string) => {
    if (!result) return;

    const colIdx = result.columns.findIndex(c => c.name === colName);
    if (colIdx < 0) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = "12px 'JetBrains Mono', 'Fira Code', Consolas, monospace";

    const col = result.columns[colIdx];
    const headerText = `${col.name} ${col.typeName}`;
    // Header uses sans-serif, measure separately
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, sans-serif';
    let maxWidth = ctx.measureText(headerText).width;
    if (col.isPrimaryKey) maxWidth += 16;

    // Cell values use monospace
    ctx.font = "12px 'JetBrains Mono', 'Fira Code', Consolas, monospace";
    const rowsToMeasure = Math.min(rows.length, 100);
    for (let i = 0; i < rowsToMeasure; i++) {
      const cellVal = rows[i]?.[colIdx];
      if (cellVal != null) {
        const textWidth = ctx.measureText(cellVal).width;
        if (textWidth > maxWidth) maxWidth = textWidth;
      }
    }

    const newWidth = Math.min(Math.max(MIN_COL_WIDTH, Math.ceil(maxWidth) + 24), MAX_AUTO_FIT_WIDTH);
    setColumnWidths(prev => ({ ...prev, [colName]: newWidth }));
  }, [result, rows]);

  // Auto-fit all columns on initial data load
  const autoFitDoneRef = useRef<string>('');
  useEffect(() => {
    if (!result || result.columns.length === 0 || rows.length === 0) return;
    // Build a fingerprint to detect new result sets (avoid re-fitting on same data)
    const fingerprint = result.columns.map(c => c.name).join(',');
    if (autoFitDoneRef.current === fingerprint) return;
    autoFitDoneRef.current = fingerprint;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const monoFont = "12px 'JetBrains Mono', 'Fira Code', Consolas, monospace";
    const sansFont = '12px ui-sans-serif, system-ui, -apple-system, sans-serif';

    const newWidths: Record<string, number> = {};
    for (let colIdx = 0; colIdx < result.columns.length; colIdx++) {
      const col = result.columns[colIdx];
      // Header uses sans-serif
      ctx.font = sansFont;
      const headerText = `${col.name} ${col.typeName}`;
      let maxW = ctx.measureText(headerText).width;
      if (col.isPrimaryKey) maxW += 16;
      // Cell values use monospace
      ctx.font = monoFont;
      const rowsToMeasure = Math.min(rows.length, 100);
      for (let i = 0; i < rowsToMeasure; i++) {
        const cellVal = rows[i]?.[colIdx];
        if (cellVal != null) {
          const w = ctx.measureText(cellVal).width;
          if (w > maxW) maxW = w;
        }
      }
      newWidths[col.name] = Math.min(Math.max(MIN_COL_WIDTH, Math.ceil(maxW) + 24), MAX_AUTO_FIT_WIDTH);
    }
    setColumnWidths(newWidths);
  }, [result, rows]);

  const handleRowClick = useCallback((e: React.MouseEvent, rowIdx: number) => {
    if (!onRowSelect) return;
    if (e.shiftKey) {
      onRowSelect(rowIdx, 'range');
    } else if (e.ctrlKey || e.metaKey) {
      onRowSelect(rowIdx, 'toggle');
    } else {
      onRowSelect(rowIdx, 'single');
    }
  }, [onRowSelect]);

  const handleHideColumn = useCallback((colName: string) => {
    setHiddenColumns(prev => new Set([...prev, colName]));
  }, []);

  const handleFilterColumn = useCallback((_colName: string) => {
    // Filter integration point — parent can hook in via onSortChange extension
    // Currently a no-op; Phase 6 will wire this up
  }, []);

  // Checkbox logic
  const allChecked = rows.length > 0 && checkedRows.size === rows.length;
  const someChecked = checkedRows.size > 0 && checkedRows.size < rows.length;

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setCheckedRows(new Set(Array.from({ length: rows.length }, (_, i) => pageOffset + i)));
    } else {
      setCheckedRows(new Set());
    }
  }, [rows.length, pageOffset]);

  const handleRowCheck = useCallback((absoluteIdx: number, checked: boolean) => {
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (checked) next.add(absoluteIdx);
      else next.delete(absoluteIdx);
      return next;
    });
  }, []);

  const resolvedWidths: Record<string, number> = {};
  for (const col of result.columns) {
    resolvedWidths[col.name] = columnWidths[col.name] ?? DEFAULT_COL_WIDTH;
  }

  // Total content width = fixed columns + sum of visible column widths
  const columnsTotalWidth = visibleColumns.reduce(
    (sum, col) => sum + (resolvedWidths[col.name] ?? DEFAULT_COL_WIDTH), 0
  );
  const totalContentWidth = fixedColsWidth + columnsTotalWidth;

  return (
    <div
      className="relative h-full overflow-hidden"
      role="grid"
      aria-label="Query results"
      aria-rowcount={rows.length}
    >
      {/* Single scroll container — header + body share one scroll context */}
      <div ref={parentRef} className="h-full overflow-auto">
        <div style={{ minWidth: totalContentWidth }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex border-b border-border-subtle bg-surface">
            {/* Checkbox select-all cell */}
            {showCheckboxes && (
              <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-border-subtle py-1.5">
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded border-border-subtle accent-blue-500 cursor-pointer"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  aria-label="Select all rows"
                />
              </div>
            )}
            {/* Row # header */}
            <div className="w-10 flex-shrink-0 px-1 py-1.5 text-center text-text-muted text-xs border-r border-border-subtle select-none">
              #
            </div>
            {/* Column headers */}
            <GridHeader
              columns={visibleColumns}
              columnWidths={resolvedWidths}
              sorting={sorting}
              onSortChange={onSortChange ?? (() => {})}
              onResizeStart={handleResizeStart}
              hiddenColumns={hiddenColumns}
              onHideColumn={handleHideColumn}
              onFilterColumn={handleFilterColumn}
              onAutoFit={handleAutoFit}
            />
          </div>

          {/* Virtual body */}
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const localIdx = virtualRow.index;
              const absoluteIdx = pageOffset + localIdx;
              return (
                <GridRow
                  key={virtualRow.index}
                  rowIndex={absoluteIdx}
                  row={rows[localIdx]}
                  columns={visibleColumns}
                  columnWidths={resolvedWidths}
                  isSelected={selectedRows.has(absoluteIdx)}
                  changeType={changedRows?.get(absoluteIdx)}
                  cellOverrideValues={cellOverrideValues}
                  editingCell={editingCell?.rowIdx === absoluteIdx ? editingCell : null}
                  nullDisplay={nullDisplay}
                  virtualTop={virtualRow.start}
                  fkColumns={fkColumns}
                  isChecked={checkedRows.has(absoluteIdx)}
                  showCheckbox={showCheckboxes}
                  onCheckChange={(checked) => handleRowCheck(absoluteIdx, checked)}
                  onRowClick={(e) => handleRowClick(e, absoluteIdx)}
                  onCellDoubleClick={(colIdx) => onCellDoubleClick?.(absoluteIdx, colIdx)}
                  onCellCommit={onCellCommit ? (colIdx, val) => onCellCommit(absoluteIdx, colIdx, val) : undefined}
                  onCellCancel={onCellCancel}
                  onCellContextMenu={onCellContextMenu ? (event, colIdx, cellValue, row) => onCellContextMenu(event, absoluteIdx, colIdx, cellValue, row) : undefined}
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
