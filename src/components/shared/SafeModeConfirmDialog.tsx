import { useState } from "react";
import { AlertTriangle, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, type DialogAction } from "../ui";

export interface SafeModeConfirmDialogProps {
  open: boolean;
  level: number;
  sql: string;
  onConfirm: (tableName?: string) => void;
  onCancel: () => void;
}

const LEVEL_NAMES: Record<number, string> = {
  0: "Off",
  1: "Silent",
  2: "Alert",
  3: "Alert+",
  4: "Safe Mode",
  5: "Read-Only",
};

/** Extract first table name from SQL for level-4 hint */
function extractTableHint(sql: string): string {
  const m =
    /\b(?:FROM|INTO|UPDATE|TABLE|DROP\s+TABLE)\s+["'`]?(\w+)["'`]?/i.exec(sql);
  return m?.[1] ?? "";
}

export function SafeModeConfirmDialog({
  open,
  level,
  sql,
  onConfirm,
  onCancel,
}: SafeModeConfirmDialogProps) {
  const { t } = useTranslation();
  const [tableInput, setTableInput] = useState("");

  const levelName = LEVEL_NAMES[level] ?? `Level ${level}`;
  const isReadOnly = level === 5;
  const requiresTableInput = level === 4;
  const sqlPreview = sql.length > 200 ? sql.slice(0, 200) + "…" : sql;
  const tableHint = requiresTableInput ? extractTableHint(sql) : "";
  const canConfirm = !requiresTableInput || (tableHint ? tableInput.trim() === tableHint : tableInput.trim().length > 0);

  const description = isReadOnly
    ? t("safeMode.readOnly")
    : level === 4
    ? t("safeMode.safeModeConfirm")
    : level === 3
    ? t("safeMode.dmlDdl")
    : t("safeMode.destructive");

  const handleConfirm = () => {
    setTableInput("");
    onConfirm(requiresTableInput ? tableInput.trim() : undefined);
  };

  const handleCancel = () => {
    setTableInput("");
    onCancel();
  };

  const actions: DialogAction[] = isReadOnly
    ? []
    : [{ label: t("safeMode.runAnyway"), onClick: handleConfirm, disabled: !canConfirm, variant: 'danger' }];

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title={isReadOnly ? t("safeMode.readOnlyMode") : t("safeMode.confirmQuery")}
      size="sm"
      destructive
      cancelLabel={isReadOnly ? t("common.ok") : t("common.cancel")}
      actions={actions}
    >
      {/* Header */}
      <div className="-mt-1 mb-4 flex items-center gap-3">
        {isReadOnly ? (
          <ShieldOff size={22} className="text-state-danger-fg flex-shrink-0" />
        ) : (
          <AlertTriangle size={22} className="text-state-severe-fg flex-shrink-0" />
        )}
        <span className="text-xs text-text-secondary">{t("safeMode.safeModeLabel", { level: levelName })}</span>
      </div>

      {/* Description */}
      <p className="mb-3 text-xs text-text-secondary">
        {description}
      </p>

      {/* SQL preview */}
      <pre className="mb-4 max-h-24 overflow-auto rounded bg-surface p-2 text-xs text-text-secondary whitespace-pre-wrap break-words">
        {sqlPreview}
      </pre>

      {/* Level 4: table name input */}
      {requiresTableInput && (
        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            {t("safeMode.typeTableName", { hint: tableHint ? ` "${tableHint}"` : "" })}
          </label>
          <input
            type="text"
            value={tableInput}
            autoFocus
            onChange={(e) => setTableInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canConfirm) handleConfirm();
            }}
            placeholder={tableHint || "table name"}
            className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary focus:border-state-severe-fg"
          />
        </div>
      )}
    </Dialog>
  );
}
