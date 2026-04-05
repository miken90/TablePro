import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QueryLogEntry } from '../../stores/queryLogStore';

interface ResultStatusBarProps {
  logEntries: QueryLogEntry[];
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-0.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={t("resultStatusBar.copy")}
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  );
}

export function ResultStatusBar({ logEntries }: ResultStatusBarProps) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-y-auto font-mono text-xs">
      {logEntries.length === 0 ? (
        <p className="p-3 text-[var(--color-text-muted)]">{t("resultStatusBar.noQueries")}</p>
      ) : (
        logEntries.map((entry) => (
          <div
            key={entry.id}
            className={`group relative border-b border-[var(--color-border-subtle)] px-3 py-2 ${
              entry.status === 'error' ? 'bg-red-500/5' : ''
            }`}
          >
            <CopyButton
              text={
                entry.error
                  ? `${entry.sql}\n-- Error: ${typeof entry.error === 'string' ? entry.error : JSON.stringify(entry.error)}`
                  : entry.sql
              }
            />
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                entry.status === 'running' ? 'text-blue-500' :
                entry.status === 'error'   ? 'text-red-500' :
                                             'text-green-500'
              }`}>
                {entry.status === 'running' ? '⏳' : entry.status === 'error' ? '✗' : '✓'}
                {' '}{entry.source}
              </span>
              {entry.durationMs !== undefined && (
                <span className="text-[10px] text-[var(--color-text-muted)]">{entry.durationMs.toFixed(0)}ms</span>
              )}
              {entry.rowCount !== undefined && (
                <span className="text-[10px] text-[var(--color-text-muted)]">{entry.rowCount} rows</span>
              )}
              <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-all text-[var(--color-text-secondary)]">
              {entry.sql}
            </pre>
            {entry.error && (
              <p className="mt-1 text-red-500">
                {typeof entry.error === 'string' ? entry.error : JSON.stringify(entry.error)}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
