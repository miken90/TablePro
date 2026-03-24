import { useCallback, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface UnsavedChangesDialogProps {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({ open, onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onCancel();
    },
    [open, onCancel],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="w-[380px] rounded-lg border border-border-subtle bg-surface-base p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-500/15 p-1.5">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-text-primary">Unsaved Changes</h3>
            <p className="mt-1 text-xs text-text-muted">
              This table has unsaved changes. What would you like to do?
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-text-muted hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="rounded px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="rounded bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-accent-blue/90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
