import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui';

interface ConfirmRefreshDialogProps {
  open: boolean;
  changeCount: number;
  onSaveAndRefresh: () => void;
  onDiscardAndRefresh: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

/**
 * SCR-44 — refreshing over staged edits. Initial focus is on Cancel: Enter
 * used to land on Save & Refresh, committing a write the user had not read.
 */
export function ConfirmRefreshDialog({
  open,
  changeCount,
  onSaveAndRefresh,
  onDiscardAndRefresh,
  onCancel,
  isSaving,
}: ConfirmRefreshDialogProps) {
  const { t } = useTranslation();
  const changeLabel = changeCount === 1 ? t("grid.changeToolbar.change") : t("grid.changeToolbar.changes");

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t("confirmRefresh.title")}
      size="sm"
      destructive
      cancelLabel={t("common.cancel")}
      actions={[
        { label: t("confirmRefresh.discardAndRefresh"), onClick: onDiscardAndRefresh, variant: "danger-ghost" },
        {
          label: isSaving ? t("confirmRefresh.saving") : t("confirmRefresh.saveAndRefresh"),
          onClick: onSaveAndRefresh,
          variant: "primary",
          loading: isSaving,
          disabled: isSaving,
        },
      ]}
    >
      <p className="text-ui-sm text-text-secondary">
        {t("confirmRefresh.message", { count: changeCount, label: changeLabel })}
      </p>
    </Dialog>
  );
}
