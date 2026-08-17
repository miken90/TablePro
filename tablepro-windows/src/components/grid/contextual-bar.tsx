import { useCallback, useEffect, useState } from 'react';
import { Filter, Plus, Trash2, Undo2, Redo2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ColumnInfo } from '../../types/query';
import { useChangeStore } from '../../stores/changeStore';
import { useFilterStore } from '../../stores/filterStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { FilterPanel } from '../filter/filter-panel';
import { ConfirmDiscardDialog } from '../shared/confirm-discard-dialog';

interface ContextualBarProps {
  tabId: string;
  tableName: string;
  columns: ColumnInfo[];
  onSave: () => void;
  onAddRow?: () => void;
  /** Number of currently selected rows. */
  selectedRowCount?: number;
  /** Callback to delete the selected rows (stages them as pending changes). */
  onDeleteSelected?: () => void;
  /** Callback to clear current row selection. */
  onDeselectAll?: () => void;
}

export function ContextualBar({
  tabId, tableName, columns, onSave, onAddRow,
  selectedRowCount = 0, onDeleteSelected, onDeselectAll,
}: ContextualBarProps) {
  const { t } = useTranslation();
  const hasChanges = useChangeStore((s) => Object.keys(s._changes).length > 0);
  const changeCount = useChangeStore((s) => Object.keys(s._changes).length);
  const undo = useChangeStore((s) => s.undo);
  const redo = useChangeStore((s) => s.redo);
  const clear = useChangeStore((s) => s.clear);
  const undoStackLen = useChangeStore((s) => s._undoStack.length);
  const redoStackLen = useChangeStore((s) => s._redoStack.length);

  const filterVisible = useLayoutStore((s) => s.filterVisible);
  const toggleFilter = useLayoutStore((s) => s.toggleFilter);

  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const activeFilterCount = useFilterStore((s) => {
    const tab = s.byTab[tabId];
    if (!tab?.appliedFilterClause) return 0;
    return tab.conditions.filter((c) => c.column && c.operator).length;
  });

  const handleToggleFilter = useCallback(() => {
    toggleFilter();
  }, [toggleFilter]);

  const handleDiscard = useCallback(() => {
    setConfirmDiscardOpen(true);
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    setConfirmDiscardOpen(false);
    clear();
  }, [clear]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const changeLabel = changeCount === 1 ? t("grid.changeToolbar.change") : t("grid.changeToolbar.changes");

  return (
    <div className="border-b border-border-subtle bg-surface">
      {/* Row 1: Action strip */}
      <div className="flex items-center gap-2 px-3 py-1">
        <button
          onClick={handleToggleFilter}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
            filterVisible || activeFilterCount > 0
              ? 'bg-accent-blue/10 text-accent-blue'
              : 'text-text-muted hover:bg-surface-muted hover:text-text-primary'
          }`}
          title={t("grid.contextualBar.toggleFilters")}
        >
          <Filter size={12} />
          {t("common.filter")}
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-accent-blue px-1 text-[10px] text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {onAddRow && (
          <button
            onClick={onAddRow}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted hover:bg-surface-muted hover:text-text-primary"
            title="Add new row (Ctrl+I)"
          >
            <Plus size={12} />
            {t("grid.contextualBar.addRow")}
          </button>
        )}
      </div>

      {/* Row 1.5: Selection strip — shown when rows are selected */}
      {selectedRowCount > 0 && (
        <div className="flex items-center gap-2 border-t border-border-subtle px-3 py-1 bg-accent-blue/5">
          <span className="text-xs font-medium text-accent-blue">
            {selectedRowCount} {selectedRowCount === 1 ? 'row' : 'rows'} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            {onDeleteSelected && (
              <button
                onClick={onDeleteSelected}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-700"
                title={`Delete ${selectedRowCount} selected row${selectedRowCount > 1 ? 's' : ''}`}
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
            {onDeselectAll && (
              <button
                onClick={onDeselectAll}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted hover:bg-surface-muted hover:text-text-primary"
                title="Deselect all"
              >
                <X size={12} />
                Deselect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Row 2: Expanded filter (compact mode) */}
      {filterVisible && (
        <FilterPanel
          tabId={tabId}
          tableName={tableName}
          columns={columns}
          compact
        />
      )}

      {/* Row 3: Change actions */}
      {hasChanges && (
        <div className="state-strip-warning flex items-center gap-2 border-t px-3 py-1 text-xs">
          <span className="text-accent-yellow">
            {t("grid.changeToolbar.unsavedChanges", { count: changeCount, label: changeLabel })}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={undo}
              disabled={undoStackLen === 0}
              className="menu-item-button flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={12} />
              {t("common.undo")}
            </button>
            <button
              onClick={redo}
              disabled={redoStackLen === 0}
              className="menu-item-button flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={12} />
              {t("common.redo")}
            </button>
            <button
              onClick={handleDiscard}
              className="menu-item-button-danger rounded border border-accent-red px-2 py-0.5 text-xs"
            >
              {t("common.discard")}
            </button>
            <button
              onClick={onSave}
              className="button-success px-3 py-1 text-xs font-semibold shadow-sm"
              title={t("grid.changeToolbar.saveChanges")}
            >
              {t("grid.changeToolbar.executeCount", { count: changeCount })}
            </button>
          </div>
        </div>
      )}

      <ConfirmDiscardDialog
        open={confirmDiscardOpen}
        changeCount={changeCount}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setConfirmDiscardOpen(false)}
      />
    </div>
  );
}
