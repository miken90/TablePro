import React from 'react';
import type { QueryLogEntry } from '../../stores/queryLogStore';

interface ResultStatusBarProps {
  logEntries: QueryLogEntry[];
}

export function ResultStatusBar({ logEntries }: ResultStatusBarProps) {
  return (
    <div className="h-full overflow-y-auto font-mono text-xs">
      {logEntries.length === 0 ? (
        <p className="p-3 text-zinc-500">No queries executed yet.</p>
      ) : (
        logEntries.map((entry) => (
          <div
            key={entry.id}
            className={`border-b border-zinc-100 dark:border-zinc-800 px-3 py-2 ${
              entry.status === 'error' ? 'bg-red-50 dark:bg-red-900/10' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                entry.status === 'running' ? 'text-blue-500' :
                entry.status === 'error'   ? 'text-red-500' :
                                             'text-green-600 dark:text-green-400'
              }`}>
                {entry.status === 'running' ? '⏳' : entry.status === 'error' ? '✗' : '✓'}
                {' '}{entry.source}
              </span>
              {entry.durationMs !== undefined && (
                <span className="text-[10px] text-zinc-400">{entry.durationMs.toFixed(0)}ms</span>
              )}
              {entry.rowCount !== undefined && (
                <span className="text-[10px] text-zinc-400">{entry.rowCount} rows</span>
              )}
              <span className="ml-auto text-[10px] text-zinc-400">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-all text-zinc-700 dark:text-zinc-300">
              {entry.sql}
            </pre>
            {entry.error && (
              <p className="mt-1 text-red-600 dark:text-red-400">{entry.error}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
