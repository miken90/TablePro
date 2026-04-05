import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnInfo } from '../../types/query';

interface ColumnMenuProps {
  column: ColumnInfo;
  position: { x: number; y: number };
  onSort: (dir: 'asc' | 'desc') => void;
  onFilter: () => void;
  onHide: () => void;
  onCopyName: () => void;
  onSelectColumn?: () => void;
  onClose: () => void;
}

export function ColumnMenu({
  column,
  position,
  onSort,
  onFilter,
  onHide,
  onCopyName,
  onSelectColumn,
  onClose,
}: ColumnMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const itemClass =
    'w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg py-1"
      style={{ top: position.y, left: position.x }}
    >
      <div className="px-3 py-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide truncate">
        {column.name}
      </div>
      <div className="h-px bg-zinc-100 dark:bg-zinc-700 mx-1 my-1" />

      <button className={itemClass} onClick={() => { onSort('asc'); onClose(); }}>
        {t("grid.columnMenu.sortAsc")}
      </button>
      <button className={itemClass} onClick={() => { onSort('desc'); onClose(); }}>
        {t("grid.columnMenu.sortDesc")}
      </button>

      <div className="h-px bg-zinc-100 dark:bg-zinc-700 mx-1 my-1" />

      <button className={itemClass} onClick={() => { onFilter(); onClose(); }}>
        {t("grid.columnMenu.filterByColumn")}
      </button>
      <button className={itemClass} onClick={() => { onHide(); onClose(); }}>
        {t("grid.columnMenu.hideColumn")}
      </button>
      {onSelectColumn && (
        <button className={itemClass} onClick={() => { onSelectColumn(); onClose(); }}>
          {t("grid.columnMenu.selectColumn")}
        </button>
      )}

      <div className="h-px bg-zinc-100 dark:bg-zinc-700 mx-1 my-1" />

      <button className={itemClass} onClick={() => { onCopyName(); onClose(); }}>
        {t("grid.columnMenu.copyColumnName")}
      </button>
    </div>
  );
}
