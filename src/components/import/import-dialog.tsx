import { useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp } from 'lucide-react';
import { extractErrorMessage } from '../../ipc/error';
import { onImportProgress, type ImportProgress as ImportProgressPayload } from '../../ipc/events';
import { ImportPreviewPanel, type ImportPreview } from './import-preview';
import { ImportProgress } from './import-progress';
import { Dialog, type DialogAction } from '../ui';

// ---------------------------------------------------------------------------
// Types (mirrored from Rust — we can't import commands.ts which we can't edit)
// ---------------------------------------------------------------------------

interface ImportOptions {
  wrapInTransaction: boolean;
  disableFkChecks: boolean;
}

interface ImportResult {
  statementsExecuted: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'previewing' | 'ready' | 'importing' | 'done' | 'error';

export function ImportDialog({ open: isOpen, onClose, sessionId, onComplete }: ImportDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [options, setOptions] = useState<ImportOptions>({
    wrapInTransaction: true,
    disableFkChecks: false,
  });

  // Last known progress for this attempt. `null` means no `import_progress`
  // event has arrived yet — the error branch must say so rather than
  // printing a misleading "0 executed" [Q7].
  const lastProgressRef = useRef<{ current: number; total: number } | null>(null);

  const isImporting = phase === 'importing';

  const reset = useCallback(() => {
    setPhase('idle');
    setFilePath(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setProgress({ current: 0, total: 0 });
    lastProgressRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handlePickFile = useCallback(async () => {
    setError(null);
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: 'SQL Files', extensions: ['sql', 'gz'] }],
      });
      if (!picked) return;
      const path = Array.isArray(picked) ? picked[0] : picked;
      setFilePath(path);
      setPhase('previewing');

      const p = await invoke<ImportPreview>('import_preview', { path });
      setPreview(p);
      setPhase('ready');
    } catch (e) {
      setError(extractErrorMessage(e));
      setPhase('idle');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!filePath) return;
    setError(null);
    // Reset at the start of every attempt — a retry must never report the
    // previous attempt's counts [Q7 mechanics / RT-13].
    lastProgressRef.current = null;
    setProgress({ current: 0, total: 0 });
    setPhase('importing');

    // Attach the listener BEFORE invoking and await it in this same async
    // scope, so a backend error that arrives before the first progress
    // event can never race an as-yet-unattached listener [RT-13].
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await onImportProgress((p: ImportProgressPayload) => {
        lastProgressRef.current = p;
        setProgress(p);
      });

      const res = await invoke<ImportResult>('import_sql_file', {
        sessionId,
        path: filePath,
        options,
      });
      setResult(res);
      setPhase('done');
    } catch (e) {
      setError(extractErrorMessage(e));
      setPhase('error');
    } finally {
      unlisten?.();
    }
  }, [filePath, sessionId, options]);

  const handleImportComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const setOpt = useCallback(
    <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) =>
      setOptions((prev) => ({ ...prev, [key]: value })),
    [],
  );

  if (!isOpen) return null;

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;

  // Q7 — no overlay click, no Escape while importing. Dialog has no header
  // close button, so blocking onClose covers every dismiss vector the
  // requirement names.
  const dialogOnClose = isImporting ? () => {} : handleClose;

  const lastProgress = lastProgressRef.current;
  const partialStateSentence = !lastProgress
    ? 'No progress reported — partial state unknown.'
    : `Executed ${lastProgress.current} of ${lastProgress.total} statement${lastProgress.total !== 1 ? 's' : ''} before the failure.`;
  // import_service.rs discards the ROLLBACK result (`let _ = driver.execute("ROLLBACK")`),
  // so the frontend cannot claim the rollback completed — only that it was requested.
  const dispositionSentence = options.wrapInTransaction
    ? 'A rollback was requested; the app cannot confirm it completed.'
    : 'The statements that ran were committed.';
  // import_sql_file takes no resume offset — Retry always replays the whole
  // file. When statements already committed outside a transaction, relabel
  // and warn so re-running doesn't surprise the user with duplicate writes.
  const isRerunWithDuplicateRisk = !options.wrapInTransaction && !!lastProgress && lastProgress.current > 0;
  const retryLabel = isRerunWithDuplicateRisk ? 'Re-run entire file' : 'Retry';

  const cancelLabel = phase === 'done' || phase === 'error' ? 'Close' : 'Cancel';
  const actions: DialogAction[] =
    phase === 'error'
      ? [{ label: retryLabel, onClick: handleImport }]
      : phase === 'done' || phase === 'importing'
        ? []
        : [{ label: 'Import', onClick: handleImport, disabled: phase !== 'ready' }];

  return (
    <Dialog open={isOpen} onClose={dialogOnClose} title="Import SQL File" size="md" cancelLabel={cancelLabel} actions={actions}>
      <div className="space-y-4">
        {/* File picker */}
        <div>
          <label className="mb-1.5 block text-xs text-zinc-500 dark:text-zinc-400">
            SQL file (.sql or .sql.gz)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {fileName ?? <span className="italic text-zinc-400">No file selected</span>}
            </div>
            <button
              onClick={handlePickFile}
              disabled={isImporting}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500"
            >
              Browse…
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Options</label>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={options.wrapInTransaction}
              onChange={(e) => setOpt('wrapInTransaction', e.target.checked)}
              disabled={isImporting}
              className="rounded"
            />
            Wrap in transaction (rollback on error)
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={options.disableFkChecks}
              onChange={(e) => setOpt('disableFkChecks', e.target.checked)}
              disabled={isImporting}
              className="rounded"
            />
            Disable foreign key checks
          </label>
        </div>

        {/* Preview */}
        {phase === 'previewing' && (
          <div className="flex items-center gap-2 rounded border border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <span className="animate-pulse">Scanning file…</span>
          </div>
        )}
        {(phase === 'ready' || phase === 'importing' || phase === 'done' || phase === 'error') &&
          preview && <ImportPreviewPanel preview={preview} />}

        {/* Progress */}
        {isImporting && (
          <ImportProgress
            isImporting={isImporting}
            current={progress.current}
            total={progress.total}
            onComplete={handleImportComplete}
          />
        )}

        {/* Done result */}
        {phase === 'done' && result && (
          <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            Imported{' '}
            <strong>{result.statementsExecuted.toLocaleString()}</strong> statement
            {result.statementsExecuted !== 1 ? 's' : ''} in{' '}
            <strong>{(result.durationMs / 1000).toFixed(2)}s</strong>.
          </div>
        )}

        {/* Error — the honest partial-state report Q7 requires, once an
            import attempt has actually started. */}
        {phase === 'error' && error && (
          <div className="space-y-1.5 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <p>{error}</p>
            <p>{partialStateSentence}</p>
            <p>{dispositionSentence}</p>
            {isRerunWithDuplicateRisk && (
              <p className="flex items-center gap-1 font-medium">
                <FileUp size={12} className="flex-shrink-0" />
                {lastProgress!.current} statement{lastProgress!.current !== 1 ? 's' : ''} already committed and will run again.
              </p>
            )}
          </div>
        )}

        {/* File-pick / preview errors — no import attempt happened, so no
            partial-state report applies. */}
        {phase !== 'error' && error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}
