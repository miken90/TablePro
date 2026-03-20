import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmRefreshDialogProps {
  open: boolean;
  changeCount: number;
  onSaveAndRefresh: () => void;
  onDiscardAndRefresh: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function ConfirmRefreshDialog({
  open,
  changeCount,
  onSaveAndRefresh,
  onDiscardAndRefresh,
  onCancel,
  isSaving,
}: ConfirmRefreshDialogProps) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <AlertTriangle
            size={20}
            className="mt-0.5 flex-shrink-0 text-amber-500"
          />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Unsaved Changes
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              You have {changeCount} unsaved {changeCount === 1 ? 'change' : 'changes'}. What would you like to do?
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDiscardAndRefresh}
            className="px-3 py-1.5 rounded text-xs font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Discard & Refresh
          </button>
          <button
            type="button"
            onClick={onSaveAndRefresh}
            disabled={isSaving}
            autoFocus
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : 'Save & Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}
