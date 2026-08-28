import { useTranslation } from "react-i18next";
import { Dialog } from "../ui";

interface UnsavedChangesDialogProps {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/** SCR-46 — leaving a table with staged edits. Initial focus sits on Cancel. */
export function UnsavedChangesDialog({ open, onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t("unsavedChanges.title")}
      size="sm"
      destructive
      cancelLabel={t("common.cancel")}
      actions={[
        { label: t("common.discard"), onClick: onDiscard, variant: "danger-ghost" },
        { label: t("common.save"), onClick: onSave, variant: "primary" },
      ]}
    >
      <p className="text-ui-sm text-text-secondary">{t("unsavedChanges.message")}</p>
    </Dialog>
  );
}
