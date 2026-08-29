import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog } from "../ui";

export type TableOperationType = "truncate" | "delete-all" | "drop" | "drop-view";

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
  "drop-view": {
    title: "Drop View",
    description: "This will permanently delete the view definition. This action cannot be undone.",
    buttonLabel: "Drop View",
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
    },
    [handleConfirm],
  );

  const canConfirm = confirmText === tableName;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={config.title}
      size="sm"
      destructive
      actions={[{ label: config.buttonLabel, onClick: handleConfirm, disabled: !canConfirm, variant: 'danger' }]}
    >
      <div onKeyDown={handleKeyDown}>
        <p className="mb-2 text-xs text-text-secondary">
          {config.description}
        </p>

        <div className="mb-4 rounded border border-border bg-surface-elevated px-3 py-2">
          <span className="text-xs font-medium text-text-primary">
            {tableName}
          </span>
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Type <strong>{tableName}</strong> to confirm:
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={tableName}
            className="w-full rounded border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary focus:border-accent-blue"
          />
        </div>
      </div>
    </Dialog>
  );
}
