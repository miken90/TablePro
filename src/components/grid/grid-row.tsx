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
import { truncateForRender } from '../DataGrid/columnar-render';

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
  editingCell?: { rowIdx: number; colIdx: number; trigger?: 'click' | 'keyboard' } | null;
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
  /** Whether the grid is in table-browse mode (enables checkbox selection). */
  isTableMode?: boolean;
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

/** design-spec 5.16 row-state table: each state's own background token, a
 *  left border on every non-default state, and a glyph or strikethrough so
 *  the signal never rides on colour alone. */
function getRowClassName(
  displayRowIndex: number,
  isSelected: boolean,
  changeType?: 'modified' | 'inserted' | 'deleted',
): string {
  const base = 'absolute left-0 w-full flex border-b border-border-subtle text-xs';
  let cls = base;

  if (changeType === 'deleted') {
    cls += ' bg-grid-row-deleted border-l-4 border-l-accent-red text-text-secondary line-through';
  } else if (changeType === 'inserted') {
    cls += ' bg-grid-row-inserted border-l-4 border-l-accent-green';
  } else if (changeType === 'modified') {
    cls += ' bg-grid-row-updated border-l-4 border-l-accent-yellow';
  } else if (isSelected) {
    cls += ' bg-grid-row-selected border-l-2 border-l-accent-blue';
  } else {
    cls += (displayRowIndex % 2 === 1 ? ' bg-grid-row-alt' : '') + ' hover:bg-grid-row-hover';
  }

  if (isSelected && changeType) {
    cls += ' ring-1 ring-inset ring-accent-blue/30';
  }

  return cls;
}

/** Inserted/updated rows swap the row number for a glyph — deleted rows keep
 *  the number and rely on the row's own strikethrough as their signal. */
function rowGlyph(changeType: GridRowProps['changeType']): string | null {
  if (changeType === 'inserted') return '+';
  if (changeType === 'modified') return '~';
  return null;
}

function CellContent({
  cellValue,
  col,
  fkColumns,
  onFkNavigate,
  changeType,
  nullDisplay,
}: {
  cellValue: string | null;
  col: ColumnInfo;
  fkColumns?: Record<string, FkRef>;
  onFkNavigate?: GridRowProps['onFkNavigate'];
  changeType?: 'modified' | 'inserted' | 'deleted';
  nullDisplay: string;
}) {
  if (cellValue === null) {
    if (changeType === 'inserted' && col.isPrimaryKey) {
      return <span className="text-[10px] font-mono text-green-500 bg-green-500/10 px-1 rounded select-none">(auto)</span>;
    }
    return <NullBadge text={nullDisplay} />;
  }

  // A single cell can hold a multi-megabyte value (BLOB, large JSON). The
  // grid renders every row of a result, so the value is sliced before it
  // reaches the DOM. Type detection runs on the slice too: a truncated JSON
  // document is no longer valid JSON and falls back to plain text, which is
  // the right thing to show for a value this size. Editing, copy and export
  // all read the untruncated value from the result.
  const rendered = truncateForRender(safeString(cellValue));
  const cellType = detectCellType(rendered, col.typeName);

  const formatted = (() => {
    switch (cellType) {
      case 'json':
        return <JsonCell value={rendered} />;
      case 'uuid':
        return <UuidCell value={rendered} />;
      case 'date':
        return <DateCell value={rendered} />;
      default:
        return (
          <span className="truncate text-text-primary flex-1 font-mono text-xs">{rendered}</span>
        );
    }
  })();

  return (
    <span className="flex items-center gap-1 min-w-0 w-full">
      {formatted}
      {fkColumns?.[col.name] && (
        <button
          className="flex-shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
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
  displayRowIndex,
  rowNumber,
  row,
  columns,
  columnWidths,
  isSelected,
  changeType,
  cellOverrideValues,
  editingCell,
  nullDisplay,
  virtualTop,
  enumValuesByColumn,
  fkColumns,
  isActiveRow,
  activeColIdx,
  selectionCols,
  isTableMode,
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
  const glyph = rowGlyph(changeType);
  return (
    <div
      className={getRowClassName(displayRowIndex, isSelected, changeType)}
      style={{ top: virtualTop, height: 28, ...(editingCell ? { zIndex: 10 } : undefined) }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('[data-cell]')) return; onRowClick(rowIndex, e); }}
    >
      {/* Row number / checkbox */}
      <div
        className="group/rowheader w-10 flex-shrink-0 px-1 flex items-center justify-center text-text-secondary border-r border-border-subtle select-none cursor-pointer hover:bg-surface-hover hover:text-text-primary"
        onClick={(e) => { e.stopPropagation(); onRowHeaderClick?.(rowIndex, e); }}
      >
        {glyph ? (
          <span className="text-xs font-mono">{glyph}</span>
        ) : isTableMode ? (
          <>
            <input
              type="checkbox"
              checked={isSelected}
              readOnly
              className={`w-3.5 h-3.5 accent-accent-blue cursor-pointer ${
                isSelected ? '' : 'opacity-0 group-hover/rowheader:opacity-100'
              } transition-opacity`}
              tabIndex={-1}
            />
            <span className={`text-xs absolute ${isSelected ? 'hidden' : 'group-hover/rowheader:hidden'}`}>
              {rowNumber ?? rowIndex + 1}
            </span>
          </>
        ) : (
          <span className="text-xs">{rowNumber ?? rowIndex + 1}</span>
        )}
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
        else cellCls += ' overflow-visible relative bg-grid-cell-editing ring-1 ring-inset ring-focus-ring';
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
                trigger={editingCell?.trigger}
              />
            ) : (
              <CellContent
                cellValue={cellValue}
                col={col}
                fkColumns={fkColumns}
                onFkNavigate={onFkNavigate}
                changeType={changeType}
                nullDisplay={nullDisplay}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
