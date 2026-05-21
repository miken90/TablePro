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
  /** 0-based display position in the virtualizer (needed for selection rect hit test). */
  displayRowIndex: number;
  /** Display row number (1-based). Falls back to rowIndex + 1 if not provided. */
  rowNumber?: number;
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
  sessionId?: string;
  /** Whether this row contains the active cell. */
  isActiveRow: boolean;
  /** Column index of the active cell (only meaningful when isActiveRow is true). */
  activeColIdx: number | null;
  /** [startCol, endCol] range within the selection rect for this row, or null if not in rect. */
  selectionCols: [number, number] | null;
  /** Callbacks now receive rowIndex as first arg — GridRow binds its own index. */
  onRowClick: (rowId: number, e: React.MouseEvent) => void;
  onCellMouseDown?: (rowId: number, colIdx: number, e: React.MouseEvent) => void;
  onCellMouseEnter?: (rowId: number, colIdx: number) => void;
  onRowHeaderClick?: (rowId: number, e: React.MouseEvent) => void;
  onCellDoubleClick?: (rowId: number, colIdx: number) => void;
  onCellCommit?: (rowId: number, colIdx: number, newValue: string | null) => void;
  onCellCancel?: () => void;
  onCellContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowId: number,
    colIdx: number,
    cellValue: string | null,
    row: (string | null)[],
  ) => void;
  onFkNavigate?: (refTable: string, refColumn: string, refSchema: string | undefined, value: string) => void;
}

function safeString(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function truncateForTitle(val: string | null, max = 1024): string | undefined {
  if (val == null) return undefined;
  const str = typeof val === 'string' ? val : safeString(val);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function getRowClassName(
  isSelected: boolean,
  changeType?: 'modified' | 'inserted' | 'deleted',
): string {
  const base = 'absolute left-0 w-full flex border-b border-border-subtle text-xs';
  let cls = base;

  if (changeType === 'deleted') {
    cls += ' bg-red-500/10 border-l-[4px] border-l-red-500 text-text-muted';
  } else if (changeType === 'inserted') {
    cls += ' bg-green-500/10 border-l-[4px] border-l-green-500';
  } else if (changeType === 'modified') {
    cls += ' bg-yellow-500/10 border-l-[4px] border-l-yellow-500';
  } else {
    cls += ' hover:bg-surface-hover';
  }

  if (isSelected && changeType) {
    cls += ' ring-1 ring-inset ring-accent-blue/30';
  }

  return cls;
}

function CellContent({
  cellValue,
  col,
  fkColumns,
  onFkNavigate,
  changeType,
}: {
  cellValue: string | null;
  col: ColumnInfo;
  fkColumns?: Record<string, FkRef>;
  onFkNavigate?: GridRowProps['onFkNavigate'];
  changeType?: 'modified' | 'inserted' | 'deleted';
}) {
  if (cellValue === null) {
    if (changeType === 'inserted' && col.isPrimaryKey) {
      return <span className="text-[10px] font-mono text-green-500 bg-green-500/10 px-1 rounded select-none">(auto)</span>;
    }
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
          <span className="truncate text-text-primary flex-1 font-mono text-xs">{typeof cellValue === 'object' ? JSON.stringify(cellValue) : cellValue}</span>
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

export const GridRow = React.memo(function GridRow({
  rowIndex,
  displayRowIndex: _displayRowIndex,
  rowNumber,
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
  isActiveRow,
  activeColIdx,
  selectionCols,
  onRowClick,
  onCellMouseDown,
  onCellMouseEnter,
  onRowHeaderClick,
  onCellDoubleClick,
  onCellCommit,
  onCellCancel,
  onCellContextMenu,
  onFkNavigate,
  sessionId,
}: GridRowProps) {
  return (
    <div
      className={getRowClassName(isSelected, changeType)}
      style={{ top: virtualTop, height: 28, ...(editingCell ? { zIndex: 10 } : undefined) }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('[data-cell]')) return; onRowClick(rowIndex, e); }}
    >
      {/* Row number */}
      <div
        className="w-10 flex-shrink-0 px-1 flex items-center justify-end text-text-muted border-r border-border-subtle select-none cursor-pointer hover:bg-surface-hover"
        onClick={(e) => { e.stopPropagation(); onRowHeaderClick?.(rowIndex, e); }}
      >
        {rowNumber ?? rowIndex + 1}
      </div>

      {/* Data cells */}
      {columns.map((col, colIdx) => {
        const overrideKey = `${rowIndex}:${colIdx}`;
        const hasOverride = cellOverrideValues?.has(overrideKey);
        const cellValue = hasOverride ? (cellOverrideValues!.get(overrideKey) ?? null) : row[colIdx];
        const width = columnWidths[col.name] ?? 120;
        const isEditing = editingCell?.colIdx === colIdx;

        const active = isActiveRow && activeColIdx === colIdx;
        const inSelection = selectionCols !== null
          && colIdx >= selectionCols[0]
          && colIdx <= selectionCols[1];

        let cellCls = 'flex-shrink-0 px-2 flex items-center border-r border-border-subtle cursor-default';
        if (!isEditing) cellCls += ' overflow-hidden';
        else cellCls += ' overflow-visible relative';
        if (inSelection) cellCls += ' bg-blue-100/60 dark:bg-blue-900/40';
        if (active && !isEditing) cellCls += ' ring-2 ring-inset ring-blue-500 z-[1]';

        return (
          <div
            key={col.name}
            data-cell
            className={cellCls}
            style={{ width, height: 28, ...(isEditing ? { zIndex: 50 } : undefined) }}
            title={!isEditing && cellValue != null ? truncateForTitle(cellValue) : undefined}
            onMouseDown={(e) => { e.stopPropagation(); onCellMouseDown?.(rowIndex, colIdx, e); }}
            onMouseEnter={() => onCellMouseEnter?.(rowIndex, colIdx)}
            onDoubleClick={() => onCellDoubleClick?.(rowIndex, colIdx)}
            onContextMenu={(event) => onCellContextMenu?.(event, rowIndex, colIdx, cellValue, row)}
          >
            {isEditing ? (
              <CellEditor
                value={cellValue}
                columnName={col.name}
                typeName={col.typeName}
                enumValues={enumValuesByColumn?.[col.name]}
                onCommit={(val) => onCellCommit?.(rowIndex, colIdx, val)}
                onCancel={() => onCellCancel?.()}
                autoFocus
                sessionId={sessionId}
                fkRef={fkColumns?.[col.name]}
              />
            ) : (
              <CellContent
                cellValue={cellValue}
                col={col}
                fkColumns={fkColumns}
                onFkNavigate={onFkNavigate}
                changeType={changeType}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
