import React, { useRef, useCallback } from 'react';
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
}

const DEFAULT_COL_WIDTH = 120;
const MIN_COL_WIDTH = 80;
const ROW_HEIGHT = 28;

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
}: DataGridProps) {
  const nullDisplay = useSettingsStore(s => s.settings.nullDisplay);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const rows = result.rows;

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

  const resolvedWidths: Record<string, number> = {};
  for (const col of result.columns) {
    resolvedWidths[col.name] = columnWidths[col.name] ?? DEFAULT_COL_WIDTH;
  }

  // Sync header horizontal scroll with body
  const handleBodyScroll = useCallback(() => {
    if (parentRef.current && headerRef.current) {
      headerRef.current.scrollLeft = parentRef.current.scrollLeft;
    }
  }, []);

  return (
    <div className="relative h-full overflow-hidden flex flex-col">
      {/* Header (scroll synced with body) */}
      <div ref={headerRef} className="flex-shrink-0 overflow-hidden">
        <GridHeader
          columns={result.columns}
          columnWidths={resolvedWidths}
          sorting={sorting}
          onSortChange={onSortChange ?? (() => {})}
          onResizeStart={handleResizeStart}
        />
      </div>

      {/* Scrollable body */}
      <div ref={parentRef} className="flex-1 overflow-auto" onScroll={handleBodyScroll}>
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
                columns={result.columns}
                columnWidths={resolvedWidths}
                isSelected={selectedRows.has(absoluteIdx)}
                changeType={changedRows?.get(absoluteIdx)}
                cellOverrideValues={cellOverrideValues}
                editingCell={editingCell?.rowIdx === absoluteIdx ? editingCell : null}
                nullDisplay={nullDisplay}
                virtualTop={virtualRow.start}
                fkColumns={fkColumns}
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
  );
}
