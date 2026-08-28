import { Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * SCR-23 — row actions only. Staged-change actions moved to the
 * pending-changes strip at the bottom of the results region, where they sit
 * next to the data they describe instead of above it (Q2).
 */
interface ContextualBarProps {
  onAddRow?: () => void;
  /** Number of currently selected rows. */
  selectedRowCount?: number;
  /** Callback to delete the selected rows (stages them as pending changes). */
  onDeleteSelected?: () => void;
  /** Callback to clear current row selection. */
  onDeselectAll?: () => void;
}

export function ContextualBar({
  onAddRow,
  selectedRowCount = 0, onDeleteSelected, onDeselectAll,
}: ContextualBarProps) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border-subtle bg-surface">
      {/* Row 1: Action strip */}
      <div className="flex items-center gap-2 px-3 py-1">
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
    </div>
  );
}
