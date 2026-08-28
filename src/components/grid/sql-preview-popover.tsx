import { useCallback, useState, type RefObject } from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover } from "../ui";
import type { SavePayload } from "../../ipc/commands";
import { formatSavePlan, useSavePlan } from "./use-save-plan";

interface SqlPreviewPopoverProps {
  open: boolean;
  sessionId: string | undefined;
  /** Built once by the caller, so the preview describes one fixed payload. */
  payload: SavePayload | null;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
}

/**
 * SCR-25 — the statements the write will run, fetched from the backend's
 * `preview_statements`.
 *
 * Nothing here assembles SQL. The old version had its own generator whose
 * quoting, typing and transaction wrapping all differed from the write path,
 * so the preview could show a statement the app never ran.
 */
export function SqlPreviewPopover({ open, sessionId, payload, anchorRef, onClose }: SqlPreviewPopoverProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { plan, loading, error, retry } = useSavePlan(sessionId, payload, open);

  const sql = plan ? formatSavePlan(plan) : "";

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sql]);

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="w-[var(--w-popover-max)]">
      <div className="flex items-center justify-between border-b border-border-subtle px-lg py-md">
        <span className="text-ui-sm font-medium text-text-secondary">{t("sqlPreview.title")}</span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!plan}
          className="focus-ring flex items-center gap-xs rounded px-sm py-xs text-ui-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-40"
        >
          <Copy size={11} aria-hidden="true" />
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>

      {loading && (
        <p className="px-lg py-md text-ui-sm text-text-secondary">Generating preview…</p>
      )}

      {error && (
        <div className="state-strip-danger flex items-center gap-md px-lg py-md text-ui-sm">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={retry}
            className="focus-ring rounded px-sm py-xs font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {plan && (
        <pre className="max-h-[var(--h-popover-max)] overflow-auto whitespace-pre-wrap break-all p-lg font-mono text-ui-sm text-text-primary">
          {sql}
        </pre>
      )}
    </Popover>
  );
}
