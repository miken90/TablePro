import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * SCR-23 — row actions only. Staged-change actions moved to the
 * pending-changes strip at the bottom of the results region, where they sit
 * next to the data they describe instead of above it (Q2).
 *
 * Selected-row actions (count, delete selected, deselect all) live in the
 * always-present `ResultToolbar` row instead of a conditional sibling here —
 * a conditional row above the grid shifted every row's vertical position by
 * one row height each time selection toggled.
 */
interface ContextualBarProps {
  onAddRow?: () => void;
}

export function ContextualBar({ onAddRow }: ContextualBarProps) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border-subtle bg-surface">
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
    </div>
  );
}
