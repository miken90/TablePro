import { Search, Plus, RefreshCw } from "lucide-react";
import { Field, IconButton } from "../ui";

interface SidebarTreeHeaderProps {
  filter: string;
  onFilterChange: (value: string) => void;
  placeholder: string;
  searchLabel: string;
  showNewTable: boolean;
  onNewTable: () => void;
  newTableDisabled: boolean;
  onRefresh: () => void;
  refreshDisabled: boolean;
  refreshing: boolean;
}

/** SCR-04 — the tree's search + refresh row, with accessible names on both. */
export function SidebarTreeHeader({
  filter,
  onFilterChange,
  placeholder,
  searchLabel,
  showNewTable,
  onNewTable,
  newTableDisabled,
  onRefresh,
  refreshDisabled,
  refreshing,
}: SidebarTreeHeaderProps) {
  return (
    <div className="border-b border-border p-2">
      <Field>
        <Search size={12} className="text-text-muted" aria-hidden="true" />
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-secondary"
        />
      </Field>
      <div className="mt-2 flex gap-1.5">
        {showNewTable && (
          <button
            onClick={onNewTable}
            disabled={newTableDisabled}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={12} aria-hidden="true" />
            New Table
          </button>
        )}
        <IconButton
          onClick={onRefresh}
          disabled={refreshDisabled}
          title="Refresh schema (reload tables)"
          aria-label="Refresh schema"
          icon={<RefreshCw size={12} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />}
          className="border border-border bg-surface-elevated"
        />
      </div>
    </div>
  );
}
