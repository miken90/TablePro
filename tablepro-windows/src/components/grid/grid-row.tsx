import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { ColumnInfo } from '../../types/query';
import type { FkRef } from '../../stores/schemaStore';
import { CellEditor } from './cell-editor';
import { detectCellType } from '../../utils/cell-formatter';
import { NullBadge } from './cell-formatters/null-badge';
import { JsonCell } from './cell-formatters/json-cell';
import { UuidCell } from './cell-formatters/uuid-cell';
import { DateCell } from './cell-formatters/date-cell';

interface GridRowProps {
  rowIndex: number;
  row: (string | null)[];
  columns: ColumnInfo[];
  columnWidths: Record<string, number>;
  isSelected: boolean;
  changeType?: 'modified' | 'inserted' | 'deleted';
  cellOverrideValues?: Map<string, string | null>;
  editingCell?: { rowIdx: number; colIdx: number } | null;
  nullDisplay: string;
  virtualTop: number;
  enumValuesByColumn?: Record<string, string[]>;
  fkColumns?: Record<string, FkRef>;
  isChecked?: boolean;
  onCheckChange?: (checked: boolean) => void;
  onRowClick: (e: React.MouseEvent) => void;
  onCellDoubleClick?: (colIdx: number) => void;
  onCellCommit?: (colIdx: number, newValue: string | null) => void;
  onCellCancel?: () => void;
  onCellContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
    colIdx: number,
    cellValue: string | null,
    row: (string | null)[],
  ) => void;
  onFkNavigate?: (refTable: string, refColumn: string, refSchema: string | undefined, value: string) => void;
}

function getRowClassName(
  isSelected: boolean,
  changeType?: 'modified' | 'inserted' | 'deleted',
): string {
  const base = 'absolute left-0 w-full flex border-b border-zinc-100 dark:border-zinc-800 text-xs';

  if (changeType === 'deleted') {
    return `${base} bg-red-500/10 border-l-2 border-l-red-500 opacity-60 line-through`;
  }
  if (changeType === 'inserted') {
    return `${base} bg-green-500/10 border-l-2 border-l-green-500`;
  }
  if (changeType === 'modified') {
    return `${base} bg-yellow-500/10 border-l-2 border-l-yellow-500`;
  }
  if (isSelected) {
    return `${base} bg-blue-50 dark:bg-blue-900/30`;
  }
  return `${base} hover:bg-zinc-50 dark:hover:bg-zinc-800/50`;
}

function CellContent({
  cellValue,
  col,
  fkColumns,
  onFkNavigate,
}: {
  cellValue: string | null;
  col: ColumnInfo;
  fkColumns?: Record<string, FkRef>;
  onFkNavigate?: GridRowProps['onFkNavigate'];
}) {
  if (cellValue === null) {
    return <NullBadge />;
  }

  const cellType = detectCellType(cellValue, col.typeName);

  const formatted = (() => {
    switch (cellType) {
      case 'json':
        return <JsonCell value={cellValue} />;
      case 'uuid':
        return <UuidCell value={cellValue} />;
      case 'date':
        return <DateCell value={cellValue} />;
      default:
        return (
          <span className="truncate text-zinc-800 dark:text-zinc-200 flex-1">{cellValue}</span>
        );
    }
  })();

  return (
    <span className="flex items-center gap-1 min-w-0 w-full">
      {formatted}
      {fkColumns?.[col.name] && (
        <button
          className="flex-shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none"
          title={`Navigate to ${fkColumns[col.name].refTable}`}
          onClick={(e) => {
            e.stopPropagation();
            const fk = fkColumns[col.name];
            onFkNavigate?.(fk.refTable, fk.refColumn, fk.refSchema, cellValue);
          }}
        >
          <ExternalLink size={10} />
        </button>
      )}
    </span>
  );
}

export function GridRow({
  rowIndex,
  row,
  columns,
  columnWidths,
  isSelected,
  changeType,
  cellOverrideValues,
  editingCell,
  nullDisplay: _nullDisplay,
  virtualTop,
  enumValuesByColumn,
  fkColumns,
  isChecked = false,
  onCheckChange,
  onRowClick,
  onCellDoubleClick,
  onCellCommit,
  onCellCancel,
  onCellContextMenu,
  onFkNavigate,
}: GridRowProps) {
  return (
    <div
      className={getRowClassName(isSelected, changeType)}
      style={{ top: virtualTop, height: 28 }}
      onClick={onRowClick}
    >
      {/* Checkbox column */}
      <div
        className="w-10 flex-shrink-0 flex items-center justify-center border-r border-zinc-100 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-zinc-300 dark:border-zinc-600 accent-blue-500 cursor-pointer"
          checked={isChecked}
          onChange={(e) => onCheckChange?.(e.target.checked)}
          aria-label={`Select row ${rowIndex + 1}`}
        />
      </div>

      {/* Row number */}
      <div className="w-10 flex-shrink-0 px-1 flex items-center justify-end text-zinc-400 dark:text-zinc-600 border-r border-zinc-100 dark:border-zinc-800 select-none">
        {rowIndex + 1}
      </div>

      {/* Data cells */}
      {columns.map((col, colIdx) => {
        const overrideKey = `${rowIndex}:${colIdx}`;
        const hasOverride = cellOverrideValues?.has(overrideKey);
        const cellValue = hasOverride ? (cellOverrideValues!.get(overrideKey) ?? null) : row[colIdx];
        const width = columnWidths[col.name] ?? 120;
        const isEditing = editingCell?.colIdx === colIdx;

        return (
          <div
            key={col.name}
            className="flex-shrink-0 px-2 flex items-center border-r border-zinc-100 dark:border-zinc-800 overflow-hidden cursor-default"
            style={{ width, height: 28 }}
            onDoubleClick={() => onCellDoubleClick?.(colIdx)}
            onContextMenu={(event) => onCellContextMenu?.(event, colIdx, cellValue, row)}
          >
            {isEditing ? (
              <CellEditor
                value={cellValue}
                columnName={col.name}
                typeName={col.typeName}
                enumValues={enumValuesByColumn?.[col.name]}
                onCommit={(val) => onCellCommit?.(colIdx, val)}
                onCancel={() => onCellCancel?.()}
                autoFocus
              />
            ) : (
              <CellContent
                cellValue={cellValue}
                col={col}
                fkColumns={fkColumns}
                onFkNavigate={onFkNavigate}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
