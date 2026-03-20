import React, { useEffect, useState, useCallback } from 'react';
import { Copy } from 'lucide-react';

interface ConfirmExecuteDialogProps {
  open: boolean;
  sql: string;
  statementCount: number;
  isSaving: boolean;
  onExecute: () => void;
  onCancel: () => void;
}

export function ConfirmExecuteDialog({
  open,
  sql,
  statementCount,
  isSaving,
  onExecute,
  onCancel,
}: ConfirmExecuteDialogProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sql]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[560px] max-w-[90vw] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Confirm Changes
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            The following SQL will be executed
          </p>
        </div>

        {/* SQL preview */}
        <div className="mx-5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {statementCount} {statementCount === 1 ? 'statement' : 'statements'}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Copy size={11} />
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>
          </div>
          <pre className="p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 overflow-auto max-h-[40vh] whitespace-pre-wrap break-all">
            {sql}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onExecute}
            disabled={isSaving}
            autoFocus
            className="px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Executing…' : 'Execute'}
          </button>
        </div>
      </div>
    </div>
  );
}
