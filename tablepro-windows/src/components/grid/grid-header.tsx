import React from 'react';
import type { ColumnInfo } from '../../types/query';
import type { SortingState } from '@tanstack/react-table';
import { Key } from 'lucide-react';

interface GridHeaderProps {
  columns: ColumnInfo[];
  columnWidths: Record<string, number>;
  sorting: SortingState;
  onSortChange: (colName: string) => void;
  onResizeStart: (colName: string, startX: number, startWidth: number) => void;
}

function SortIndicator({ dir }: { dir: 'asc' | 'desc' | false }) {
  if (!dir) return <span className="w-3 inline-block" />;
  return <span className="text-blue-500">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export function GridHeader({
  columns,
  columnWidths,
  sorting,
  onSortChange,
  onResizeStart,
}: GridHeaderProps) {
  const sortMap = new Map(sorting.map(s => [s.id, s.desc ? 'desc' : 'asc'] as const));

  return (
    <div className="flex border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs select-none">
      {/* Row number header */}
      <div className="w-10 flex-shrink-0 px-1 py-1.5 text-center text-zinc-400 dark:text-zinc-500 border-r border-zinc-200 dark:border-zinc-700">
        #
      </div>

      {columns.map((col) => {
        const width = columnWidths[col.name] ?? 120;
        const sortDir = sortMap.get(col.name) ?? false;

        return (
          <div
            key={col.name}
            className="relative flex-shrink-0 border-r border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
            style={{ width }}
            onClick={() => onSortChange(col.name)}
          >
            <div className="flex items-center gap-1 px-2 py-1.5 overflow-hidden">
              {col.isPrimaryKey && (
                <Key size={10} className="text-amber-500 flex-shrink-0" />
              )}
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                {col.name}
              </span>
              <span className="text-zinc-400 dark:text-zinc-500 text-[10px] flex-shrink-0">
                {col.typeName}
              </span>
              <SortIndicator dir={sortDir} />
            </div>

            {/* Resize handle */}
            <div
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 dark:hover:bg-blue-500 z-10"
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeStart(col.name, e.clientX, width);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
