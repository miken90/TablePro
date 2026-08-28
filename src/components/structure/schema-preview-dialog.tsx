import { useCallback, useState } from "react";
import { Copy, AlertTriangle } from "lucide-react";
import { Dialog } from "../ui";

interface SchemaPreviewDialogProps {
  sql: string[];
  tableName: string;
  isApplying: boolean;
  applyError: string | null;
  onApply: () => void;
  onClose: () => void;
}

/**
 * SCR-33 — the DDL a structure edit will run. Destructive: initial focus is
 * on Cancel, not on Apply.
 */
export function SchemaPreviewDialog({
  sql,
  tableName,
  isApplying,
  applyError,
  onApply,
  onClose,
}: SchemaPreviewDialogProps) {
  const [copied, setCopied] = useState(false);
  const sqlText = sql.join(";\n") + (sql.length > 0 ? ";" : "");

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sqlText]);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Apply Structure Changes"
      size="md"
      destructive
      cancelLabel="Cancel"
      actions={[
        {
          label: isApplying ? "Applying…" : "Apply Changes",
          onClick: onApply,
          variant: "danger",
          loading: isApplying,
          disabled: isApplying || sql.length === 0,
        },
      ]}
    >
      <p className="mb-lg text-ui-sm text-text-secondary">
        The following SQL will be executed on <span className="font-mono font-medium">{tableName}</span>
      </p>

      <div className="rounded-md border border-border-subtle bg-surface-muted">
        <div className="flex items-center justify-between border-b border-border-subtle px-lg py-md">
          <span className="text-ui-sm font-medium text-text-secondary">
            {sql.length} statement{sql.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="focus-ring flex items-center gap-xs rounded px-sm py-xs text-ui-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <Copy size={10} aria-hidden="true" />
            {copied ? "Copied!" : "Copy SQL"}
          </button>
        </div>
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all p-lg font-mono text-ui-sm text-text-primary">
          {sqlText || "-- No changes"}
        </pre>
      </div>

      {applyError && (
        <div className="state-strip-danger mt-lg flex items-start gap-sm rounded px-lg py-md text-ui-sm">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{applyError}</span>
        </div>
      )}
    </Dialog>
  );
}
