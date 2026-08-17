import { useState, useCallback, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export type TableOperationType = "truncate" | "delete-all" | "drop";

interface TableOperationDialogProps {
  open: boolean;
  operation: TableOperationType;
  tableName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// All three operations are unrecoverable, so all three ask for the table name
// to be typed. Enter alone cannot trigger any of them — `handleConfirm`
// refuses until the typed name matches.
const OPERATION_CONFIG = {
  truncate: {
    title: "Truncate Table",
    description: "This will remove all rows from the table. This action cannot be undone.",
    buttonLabel: "Truncate",
  },
  "delete-all": {
    title: "Delete All Records",
    description: "This will delete all records from the table. This action cannot be undone.",
    buttonLabel: "Delete All",
  },
  drop: {
    title: "Drop Table",
    description: "This will permanently delete the table and all its data. This action cannot be undone.",
    buttonLabel: "Drop Table",
  },
} as const;

export function TableOperationDialog({
  open,
  operation,
  tableName,
  onConfirm,
  onCancel,
}: TableOperationDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const config = OPERATION_CONFIG[operation];

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmText("");
      // Focus input on open
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    if (confirmText !== tableName) return;
    onConfirm();
  }, [confirmText, tableName, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleConfirm();
      if (e.key === "Escape") onCancel();
    },
    [handleConfirm, onCancel],
  );

  if (!open) return null;

  const canConfirm = confirmText === tableName;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div
        className="w-[400px] rounded-lg border border-border bg-surface-primary p-5 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="shrink-0 text-accent-red" />
          <h3 className="text-sm font-semibold text-text-primary">
            {config.title}
          </h3>
        </div>

        <p className="mb-2 text-xs text-text-secondary">
          {config.description}
        </p>

        <div className="mb-4 rounded border border-border bg-surface-elevated px-3 py-2">
          <span className="text-xs font-medium text-text-primary">
            {tableName}
          </span>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-text-muted">
            Type <strong>{tableName}</strong> to confirm:
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={tableName}
            className="w-full rounded border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent-blue"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded bg-accent-red px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {config.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
