import { useCallback, useRef, useState } from 'react';
import { Undo2, Redo2, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { useChangeStore } from '../../stores/changeStore';
import { ConfirmDiscardDialog } from '../shared/confirm-discard-dialog';
import { SqlPreviewPopover } from './sql-preview-popover';
import type { SavePayload } from '../../ipc/commands';

interface PendingChangesStripProps {
  sessionId?: string;
  /** Builds the payload the write will send; also what the preview describes. */
  buildSavePayload: () => SavePayload | null;
  /** False while the grid shows a different page or sort than the edits were staged on. */
  stagedViewMatches: boolean;
  /** The page the edits were staged on, for the disabled-Execute reason. */
  stagedPage?: number;
  onExecute: () => void;
}

/**
 * SCR-24 — the pending-changes strip.
 *
 * It renders on `hasChanges` alone. The bar it replaces was guarded on two
 * further terms — a table-name prop and an explicit hide flag — and the one
 * call site set that flag, so the bar and the SQL preview it carries were
 * unreachable in the shipped app.
 */
export function PendingChangesStrip({
  sessionId,
  buildSavePayload,
  stagedViewMatches,
  stagedPage,
  onExecute,
}: PendingChangesStripProps) {
  const { t } = useTranslation();
  const hasChanges = useChangeStore((s) => s.hasChanges);
  const changeCount = useChangeStore((s) => Object.keys(s._changes).length);
  const undoStackLen = useChangeStore((s) => s._undoStack.length);
  const redoStackLen = useChangeStore((s) => s._redoStack.length);
  const undo = useChangeStore((s) => s.undo);
  const redo = useChangeStore((s) => s.redo);
  const clear = useChangeStore((s) => s.clear);

  const previewRef = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<SavePayload | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Built once when the popover opens, so what it shows describes one fixed
  // payload rather than re-fetching under the user as the grid changes.
  const openPreview = useCallback(() => {
    setPreviewPayload(buildSavePayload());
    setPreviewOpen(true);
  }, [buildSavePayload]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewPayload(null);
    previewRef.current?.focus();
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    setConfirmDiscardOpen(false);
    clear();
  }, [clear]);

  if (!hasChanges) return null;

  const changeLabel = changeCount === 1 ? t('grid.changeToolbar.change') : t('grid.changeToolbar.changes');
  // Row ids are page-local, so executing from a different page or sort would
  // write to whichever rows now sit at those indices.
  const executable = stagedViewMatches && !!sessionId && !!buildSavePayload();
  const staleReason = stagedViewMatches
    ? undefined
    : `Staged on page ${stagedPage ?? '?'} / a different sort — return there to execute`;

  return (
    <div className="state-strip-warning sticky bottom-0 z-sticky flex h-[var(--control-h-lg)] flex-none items-center gap-md border-t px-lg text-ui-sm">
      <span className="text-accent-yellow">
        {t('grid.changeToolbar.unsavedChanges', { count: changeCount, label: changeLabel })}
      </span>
      <div className="ml-auto flex items-center gap-sm">
        <Button variant="ghost" size="sm" onClick={undo} disabled={undoStackLen === 0} title="Undo (Ctrl+Z)">
          <Undo2 size={12} aria-hidden="true" />
          {t('common.undo')}
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={redoStackLen === 0} title="Redo (Ctrl+Y)">
          <Redo2 size={12} aria-hidden="true" />
          {t('common.redo')}
        </Button>
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirmDiscardOpen(true)}>
          {t('common.discard')}
        </Button>
        <Button
          ref={previewRef}
          variant="secondary"
          size="sm"
          onClick={openPreview}
          title={t('sqlPreview.previewTooltip')}
        >
          <Eye size={12} aria-hidden="true" />
          {t('grid.changeToolbar.previewSql')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onExecute}
          disabled={!executable}
          title={staleReason ?? t('grid.changeToolbar.saveChanges')}
        >
          {t('grid.changeToolbar.executeCount', { count: changeCount })}
        </Button>
      </div>

      <SqlPreviewPopover
        open={previewOpen}
        sessionId={sessionId}
        payload={previewPayload}
        anchorRef={previewRef}
        onClose={closePreview}
      />

      <ConfirmDiscardDialog
        open={confirmDiscardOpen}
        changeCount={changeCount}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setConfirmDiscardOpen(false)}
      />
    </div>
  );
}
