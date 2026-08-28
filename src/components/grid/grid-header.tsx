import React, { useState, useCallback } from 'react';
import type { ColumnInfo } from '../../types/query';
import type { SortingState } from '@tanstack/react-table';
import { Key, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ColumnMenu } from './column-menu';

interface GridHeaderProps {
  columns: ColumnInfo[];
  columnWidths: Record<string, number>;
  sorting: SortingState;
  onSortChange: (colName: string) => void;
  onResizeStart: (colName: string, startX: number, startWidth: number) => void;
  hiddenColumns?: Set<string>;
  onHideColumn?: (colName: string) => void;
  onFilterColumn?: (colName: string) => void;
  onAutoFit?: (colName: string) => void;
  onSelectColumn?: (colIdx: number) => void;
}

interface MenuState {
  column: ColumnInfo;
  x: number;
  y: number;
}

function SortIndicator({ dir }: { dir: 'asc' | 'desc' | false }) {
  if (!dir) return <span className="w-3 inline-block" />;
  return <span className="text-blue-500">{dir === 'asc' ? '↑' : '↓'}</span>;
}

/**
 * Renders column header cells only (no row-number gutter — managed by DataGrid).
 *
 * When the user selects "Filter by column" from the column menu, we fire a
 * custom DOM event `tablepro:filter-column` so the QuickFilterBar can focus
 * and prefill without needing a shared ref passed through many layers.
 */
export const GridHeader = React.memo(function GridHeader({
  columns,
  columnWidths,
  sorting,
  onSortChange,
  onResizeStart,
  onHideColumn,
  onFilterColumn,
  onAutoFit,
  onSelectColumn,
}: GridHeaderProps) {
  const { t } = useTranslation();
  const sortMap = new Map(sorting.map(s => [s.id, s.desc ? 'desc' : 'asc'] as const));
  const [menu, setMenu] = useState<MenuState | null>(null);

  const handleChevronClick = useCallback(
    (e: React.MouseEvent, col: ColumnInfo) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({ column: col, x: rect.left, y: rect.bottom + 2 });
    },
    [],
  );

  const handleFilterColumn = useCallback((colName: string) => {
    // Notify QuickFilterBar via custom DOM event (avoids deep prop drilling)
    window.dispatchEvent(
      new CustomEvent('tablepro:filter-column', { detail: { column: colName } }),
    );
    onFilterColumn?.(colName);
  }, [onFilterColumn]);

  return (
    <>
      <div className="flex text-xs select-none">
        {columns.map((col) => {
          const width = columnWidths[col.name] ?? 120;
          const sortDir = sortMap.get(col.name) ?? false;

          return (
            <div
              key={col.name}
              className="relative flex-shrink-0 border-r border-border-subtle cursor-pointer hover:bg-surface-hover group"
              style={{ width }}
              onClick={() => onSortChange(col.name)}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 overflow-hidden">
                {col.isPrimaryKey && (
                  <Key size={10} className="text-amber-500 flex-shrink-0" />
                )}
                <span className="truncate font-medium text-text-primary">
                  {col.name}
                </span>
                <span className="text-text-secondary group-hover:text-text-primary text-[10px] flex-shrink-0">
                  {col.typeName}
                </span>
                <SortIndicator dir={sortDir} />

                {/* Chevron — visible on hover */}
                <button
                  className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary transition-opacity p-0.5 rounded"
                  onClick={(e) => handleChevronClick(e, col)}
                  title={t("grid.columnMenu.columnOptions")}
                >
                  <ChevronDown size={10} />
                </button>
              </div>

              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 dark:hover:bg-blue-500 z-10"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onResizeStart(col.name, e.clientX, width);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onAutoFit?.(col.name);
                }}
              />
            </div>
          );
        })}
      </div>

      {menu && (
        <ColumnMenu
          column={menu.column}
          position={{ x: menu.x, y: menu.y }}
          onSort={(_dir) => {
            onSortChange(menu.column.name);
          }}
          onFilter={() => handleFilterColumn(menu.column.name)}
          onHide={() => onHideColumn?.(menu.column.name)}
          onCopyName={() => {
            navigator.clipboard.writeText(menu.column.name).catch(() => {});
          }}
          onSelectColumn={onSelectColumn ? () => {
            const colIdx = columns.findIndex(c => c.name === menu.column.name);
            if (colIdx >= 0) onSelectColumn(colIdx);
          } : undefined}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
});
