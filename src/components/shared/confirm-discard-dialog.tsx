import { useTranslation } from "react-i18next";
import { Dialog } from "../ui";

interface ConfirmDiscardDialogProps {
  open: boolean;
  changeCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** SCR-45 — throwing away staged edits. Initial focus sits on Cancel. */
export function ConfirmDiscardDialog({ open, changeCount, onConfirm, onCancel }: ConfirmDiscardDialogProps) {
  const { t } = useTranslation();
  const changeLabel = changeCount === 1 ? t("grid.changeToolbar.change") : t("grid.changeToolbar.changes");

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t("confirmDiscard.title", { count: changeCount, label: changeLabel })}
      size="sm"
      destructive
      cancelLabel={t("common.cancel")}
      actions={[{ label: t("common.discard"), onClick: onConfirm, variant: "danger" }]}
    >
      <p className="text-ui-sm text-text-secondary">{t("confirmDiscard.message")}</p>
    </Dialog>
  );
}
