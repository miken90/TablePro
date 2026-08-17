import { useCallback, useState } from "react";
import { X, Copy, AlertTriangle } from "lucide-react";

interface SchemaPreviewDialogProps {
  sql: string[];
  tableName: string;
  isApplying: boolean;
  applyError: string | null;
  onApply: () => void;
  onClose: () => void;
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[560px] max-w-[95vw] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Apply Structure Changes</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              The following SQL will be executed on <span className="font-mono font-medium">{tableName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* SQL Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
              {sql.length} statement{sql.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <Copy size={10} />
              {copied ? "Copied!" : "Copy SQL"}
            </button>
          </div>
          <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
            {sqlText || "-- No changes"}
          </pre>
        </div>

        {/* Error */}
        {applyError && (
          <div className="flex items-start gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{applyError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isApplying || sql.length === 0}
            className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying ? "Applying…" : "Apply Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
