import { useCallback } from 'react';
import { Filter, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ColumnInfo } from '../../types/query';
import { useFilterStore } from '../../stores/filterStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { FilterPanel } from '../filter/filter-panel';

/**
 * SCR-23 — row actions only. Staged-change actions moved to the
 * pending-changes strip at the bottom of the results region, where they sit
 * next to the data they describe instead of above it (Q2).
 */
interface ContextualBarProps {
  tabId: string;
  tableName: string;
  columns: ColumnInfo[];
  onAddRow?: () => void;
  /** Number of currently selected rows. */
  selectedRowCount?: number;
  /** Callback to delete the selected rows (stages them as pending changes). */
  onDeleteSelected?: () => void;
  /** Callback to clear current row selection. */
  onDeselectAll?: () => void;
}

export function ContextualBar({
  tabId, tableName, columns, onAddRow,
  selectedRowCount = 0, onDeleteSelected, onDeselectAll,
}: ContextualBarProps) {
  const { t } = useTranslation();

  const filterVisible = useLayoutStore((s) => s.filterVisible);
  const toggleFilter = useLayoutStore((s) => s.toggleFilter);

  const activeFilterCount = useFilterStore((s) => {
    const tab = s.byTab[tabId];
    if (!tab?.appliedFilterClause) return 0;
    return tab.conditions.filter((c) => c.column && c.operator).length;
  });

  const handleToggleFilter = useCallback(() => {
    toggleFilter();
  }, [toggleFilter]);

  return (
    <div className="border-b border-border-subtle bg-surface">
      {/* Row 1: Action strip */}
      <div className="flex items-center gap-2 px-3 py-1">
        <button
          onClick={handleToggleFilter}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
            filterVisible || activeFilterCount > 0
              ? 'bg-accent-blue/10 text-accent-blue'
              : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
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
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
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
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
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

    </div>
  );
}
