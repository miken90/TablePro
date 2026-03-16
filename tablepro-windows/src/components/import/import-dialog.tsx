import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, X } from 'lucide-react';
import { extractErrorMessage } from '../../ipc/error';
import { ImportPreviewPanel, type ImportPreview } from './import-preview';
import { ImportProgress } from './import-progress';

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
  const [options, setOptions] = useState<ImportOptions>({
    wrapInTransaction: true,
    disableFkChecks: false,
  });

  const reset = useCallback(() => {
    setPhase('idle');
    setFilePath(null);
    setPreview(null);
    setResult(null);
    setError(null);
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
    setPhase('importing');
    try {
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
  const isImporting = phase === 'importing';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleClose}
    >
      <div
        className="w-[500px] rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <FileUp size={14} className="text-zinc-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Import SQL File
            </span>
          </div>
          <button
            onClick={handleClose}
            className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 p-4">
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
            <ImportProgress isImporting={isImporting} onComplete={handleImportComplete} />
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

          {/* Error */}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isImporting && (
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
            {phase === 'done' ? (
              <button
                onClick={handleClose}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={phase !== 'ready' && phase !== 'error'}
                  className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileUp size={12} />
                  Import
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
