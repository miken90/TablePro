import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
} from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { QueryResult } from '../../types/query';
import { GridHeader } from './grid-header';
import { GridRow } from './grid-row';
import { useSettingsStore } from '../../stores/settingsStore';

interface DataGridProps {
  result: QueryResult;
  onCellDoubleClick?: (rowIdx: number, colIdx: number) => void;
  selectedRows?: Set<number>;
  onRowSelect?: (rowIdx: number, mode: 'single' | 'range' | 'toggle') => void;
  changedRows?: Map<number, 'modified' | 'inserted' | 'deleted'>;
  editingCell?: { rowIdx: number; colIdx: number } | null;
  cellOverrideValues?: Map<string, string | null>;
}

const columnHelper = createColumnHelper<(string | null)[]>();

const DEFAULT_COL_WIDTH = 120;
const MIN_COL_WIDTH = 80;
const ROW_HEIGHT = 28;

export function DataGrid({
  result,
  onCellDoubleClick,
  selectedRows = new Set(),
  onRowSelect,
  changedRows,
  cellOverrideValues,
}: DataGridProps) {
  const nullDisplay = useSettingsStore(s => s.settings.nullDisplay);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const parentRef = useRef<HTMLDivElement>(null);

  // Reset sorting when result changes
  useEffect(() => {
    setSorting([]);
  }, [result]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: any[] = result.columns.map((col, idx) =>
    columnHelper.accessor(row => row[idx], {
      id: col.name,
      header: col.name,
      enableSorting: true,
    })
  );

  const table = useReactTable({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
  });

  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const handleSortChange = useCallback((colName: string) => {
    setSorting(prev => {
      const existing = prev.find(s => s.id === colName);
      if (!existing) return [{ id: colName, desc: false }];
      if (!existing.desc) return [{ id: colName, desc: true }];
      return [];
    });
  }, []);

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

  return (
    <div className="relative h-full overflow-hidden flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex-shrink-0">
        <GridHeader
          columns={result.columns}
          columnWidths={resolvedWidths}
          sorting={sorting}
          onSortChange={handleSortChange}
          onResizeStart={handleResizeStart}
        />
      </div>

      {/* Scrollable body */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map(virtualRow => {
            const row = rows[virtualRow.index];
            const originalIdx = row.index;
            return (
              <GridRow
                key={virtualRow.index}
                rowIndex={originalIdx}
                row={result.rows[originalIdx]}
                columns={result.columns}
                columnWidths={resolvedWidths}
                isSelected={selectedRows.has(originalIdx)}
                changeType={changedRows?.get(originalIdx)}
                cellOverrideValues={cellOverrideValues}
                nullDisplay={nullDisplay}
                virtualTop={virtualRow.start}
                onRowClick={(e) => handleRowClick(e, originalIdx)}
                onCellDoubleClick={(colIdx) => onCellDoubleClick?.(originalIdx, colIdx)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
