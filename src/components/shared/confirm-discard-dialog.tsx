import { useCallback, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ConfirmDiscardDialogProps {
  open: boolean;
  changeCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDiscardDialog({ open, changeCount, onConfirm, onCancel }: ConfirmDiscardDialogProps) {
  const { t } = useTranslation();
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

  const changeLabel = changeCount === 1 ? t("grid.changeToolbar.change") : t("grid.changeToolbar.changes");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="w-[340px] rounded-lg border border-border-subtle bg-surface-base p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-500/15 p-1.5">
            <Trash2 size={16} className="text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-text-primary">
              {t("confirmDiscard.title", { count: changeCount, label: changeLabel })}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              {t("confirmDiscard.message")}
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-text-muted hover:bg-surface-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
          >
            {t("common.discard")}
          </button>
        </div>
      </div>
    </div>
  );
}
