import { useState, useRef, useEffect, useCallback } from "react";
import { Play, ChevronDown, Loader2, Square, FileText, FileSpreadsheet, ListOrdered } from "lucide-react";

interface RunSplitButtonProps {
  onRun: () => void;
  onRunAll: () => void;
  onExplain: () => void;
  onExportCsv: () => void;
  onCancel: () => void;
  isExecuting: boolean;
  disabled: boolean;
  /** Database type for Explain Plan support check */
  dbType?: string;
}

const EXPLAIN_SUPPORTED = new Set(["postgres", "postgresql", "mysql"]);

export function RunSplitButton({
  onRun,
  onRunAll,
  onExplain,
  onExportCsv,
  onCancel,
  isExecuting,
  disabled,
  dbType,
}: RunSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const explainSupported = dbType ? EXPLAIN_SUPPORTED.has(dbType.toLowerCase()) : false;

  const closeDropdown = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDropdown();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeDropdown]);

  if (isExecuting) {
    return (
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
        title="Cancel query"
        aria-label="Cancel running query"
      >
        <Square size={13} aria-hidden="true" />
        Stop
      </button>
    );
  }

  return (
    <div className="relative flex">
      {/* Primary Run button */}
      <button
        onClick={onRun}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-l bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        title="Run current statement (Ctrl+Enter)"
        aria-label="Run query"
      >
        <Play size={13} aria-hidden="true" />
        Run
      </button>

      {/* Chevron dropdown trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className="flex items-center rounded-r border-l border-blue-500 bg-blue-600 px-1.5 py-1 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        title="Run options"
        aria-label="Run options"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded border border-border-subtle bg-surface-elevated shadow-lg"
          role="menu"
        >
          <DropdownItem
            icon={<Play size={12} />}
            label="Run Current Statement"
            shortcut="Ctrl+Enter"
            onClick={() => { onRun(); closeDropdown(); }}
          />
          <DropdownItem
            icon={<ListOrdered size={12} />}
            label="Run All Statements"
            shortcut="Ctrl+Shift+Enter"
            onClick={() => { onRunAll(); closeDropdown(); }}
          />
          <DropdownItem
            icon={<FileText size={12} />}
            label="Explain Plan"
            onClick={() => { onExplain(); closeDropdown(); }}
            disabled={!explainSupported}
            title={explainSupported ? undefined : "Not supported for this engine"}
          />
          <div className="my-1 border-t border-border-subtle" />
          <DropdownItem
            icon={<FileSpreadsheet size={12} />}
            label="Export to CSV"
            onClick={() => { onExportCsv(); closeDropdown(); }}
          />
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex-shrink-0 text-text-muted">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-text-muted">{shortcut}</span>
      )}
    </button>
  );
}
