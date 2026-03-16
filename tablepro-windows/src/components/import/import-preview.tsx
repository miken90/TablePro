import React from 'react';
import { FileText } from 'lucide-react';

export interface ImportPreview {
  statementCount: number;
  fileSizeBytes: number;
  firstStatements: string[];
}

interface ImportPreviewProps {
  preview: ImportPreview;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportPreviewPanel({ preview }: ImportPreviewProps) {
  const { statementCount, fileSizeBytes, firstStatements } = preview;
  const showing = firstStatements.length;
  const hasMore = statementCount > showing;

  return (
    <div className="space-y-2">
      {/* Stats row */}
      <div className="flex items-center gap-4 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800/50">
        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <FileText size={12} />
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            {statementCount.toLocaleString()}
          </strong>
          {statementCount === 1 ? 'statement' : 'statements'}
        </span>
        <span className="text-zinc-400 dark:text-zinc-500">·</span>
        <span className="text-zinc-600 dark:text-zinc-400">
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            {formatBytes(fileSizeBytes)}
          </strong>
        </span>
      </div>

      {/* Statement list */}
      <div>
        <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
          Preview
          {hasMore ? ` (first ${showing} of ${statementCount.toLocaleString()})` : ''}
        </p>
        <div className="h-40 overflow-y-auto rounded border border-zinc-200 bg-zinc-900 p-2 dark:border-zinc-700">
          {firstStatements.length === 0 ? (
            <p className="text-[10px] italic text-zinc-500">No statements found.</p>
          ) : (
            firstStatements.map((stmt, idx) => (
              <div
                key={idx}
                className="mb-1 border-b border-zinc-800 pb-1 last:mb-0 last:border-0 last:pb-0"
              >
                <span className="mr-2 text-[9px] text-zinc-600 select-none">{idx + 1}.</span>
                <code className="break-all text-[10px] leading-relaxed text-green-400">{stmt}</code>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
