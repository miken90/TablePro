import React from 'react';
import type { ColumnInfo } from '../../types/query';

interface GridRowProps {
  rowIndex: number;
  row: (string | null)[];
  columns: ColumnInfo[];
  columnWidths: Record<string, number>;
  isSelected: boolean;
  changeType?: 'modified' | 'inserted' | 'deleted';
  cellOverrideValues?: Map<string, string | null>;
  nullDisplay: string;
  virtualTop: number;
  onRowClick: (e: React.MouseEvent) => void;
  onCellDoubleClick?: (colIdx: number) => void;
}

function getRowClassName(
  isSelected: boolean,
  changeType?: 'modified' | 'inserted' | 'deleted'
): string {
  const base = 'absolute left-0 w-full flex border-b border-zinc-100 dark:border-zinc-800 text-xs';

  if (changeType === 'deleted') {
    return `${base} bg-red-50 dark:bg-red-900/20 line-through opacity-60`;
  }
  if (changeType === 'inserted') {
    return `${base} bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500`;
  }
  if (changeType === 'modified') {
    return `${base} bg-yellow-50 dark:bg-yellow-900/20`;
  }
  if (isSelected) {
    return `${base} bg-blue-50 dark:bg-blue-900/30`;
  }
  return `${base} hover:bg-zinc-50 dark:hover:bg-zinc-800/50`;
}

export function GridRow({
  rowIndex,
  row,
  columns,
  columnWidths,
  isSelected,
  changeType,
  cellOverrideValues,
  nullDisplay,
  virtualTop,
  onRowClick,
  onCellDoubleClick,
}: GridRowProps) {
  return (
    <div
      className={getRowClassName(isSelected, changeType)}
      style={{ top: virtualTop, height: 28 }}
      onClick={onRowClick}
    >
      {/* Row number */}
      <div className="w-10 flex-shrink-0 px-1 flex items-center justify-end text-zinc-400 dark:text-zinc-600 border-r border-zinc-100 dark:border-zinc-800 select-none">
        {rowIndex + 1}
      </div>

      {/* Data cells */}
      {columns.map((col, colIdx) => {
        const overrideKey = `${rowIndex}:${colIdx}`;
        const hasOverride = cellOverrideValues?.has(overrideKey);
        const cellValue = hasOverride ? cellOverrideValues!.get(overrideKey) : row[colIdx];
        const width = columnWidths[col.name] ?? 120;

        return (
          <div
            key={col.name}
            className="flex-shrink-0 px-2 flex items-center border-r border-zinc-100 dark:border-zinc-800 overflow-hidden cursor-default"
            style={{ width, height: 28 }}
            onDoubleClick={() => onCellDoubleClick?.(colIdx)}
          >
            {cellValue === null ? (
              <span className="italic text-zinc-400 dark:text-zinc-600">{nullDisplay}</span>
            ) : (
              <span className="truncate text-zinc-800 dark:text-zinc-200">{cellValue}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
