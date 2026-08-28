import { useCallback, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui';
import type { SavePayload } from '../../ipc/commands';
import { formatSavePlan, useSavePlan } from './use-save-plan';

interface ConfirmExecuteDialogProps {
  open: boolean;
  sessionId: string | undefined;
  /** The payload instance the caller will send on Confirm. */
  payload: SavePayload | null;
  isSaving: boolean;
  onExecute: () => void;
  onCancel: () => void;
}

/**
 * SCR-43 — the commitment point for a grid save.
 *
 * The dialog fetches its own plan from the backend and keeps Execute disabled
 * until it arrives: the write cannot be authorised without the user having
 * seen the statements it will run.
 */
export function ConfirmExecuteDialog({
  open,
  sessionId,
  payload,
  isSaving,
  onExecute,
  onCancel,
}: ConfirmExecuteDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const { plan, loading, error, retry } = useSavePlan(sessionId, payload, open);

  const sql = plan ? formatSavePlan(plan) : '';
  const statementCount = plan?.statements.length ?? 0;
  const stmtLabel = statementCount === 1 ? t('confirmExecute.statement') : t('confirmExecute.statements');

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sql]);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t('confirmExecute.title')}
      size="md"
      destructive
      cancelLabel={t('common.cancel')}
      actions={[
        {
          label: isSaving ? t('confirmExecute.executing') : t('common.execute'),
          onClick: onExecute,
          variant: 'danger',
          loading: isSaving,
          disabled: isSaving || !plan,
        },
      ]}
    >
      <p className="mb-lg text-ui-sm text-text-secondary">{t('confirmExecute.subtitle')}</p>

      {loading && (
        <p className="text-ui-sm text-text-secondary">Generating preview…</p>
      )}

      {error && (
        <div className="state-strip-danger flex items-center gap-md rounded px-lg py-md text-ui-sm">
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
        <div className="rounded-md border border-border-subtle bg-surface-muted">
          <div className="flex items-center justify-between border-b border-border-subtle px-lg py-md">
            <span className="text-ui-sm font-medium text-text-secondary">
              {t('confirmExecute.statementCount', { count: statementCount, label: stmtLabel })}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="focus-ring flex items-center gap-xs rounded px-sm py-xs text-ui-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Copy size={11} aria-hidden="true" />
              {copied ? t('common.copied') : t('confirmExecute.copySql')}
            </button>
          </div>
          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all p-lg font-mono text-ui-sm text-text-primary">
            {sql}
          </pre>
        </div>
      )}
    </Dialog>
  );
}
