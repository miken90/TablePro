import React from 'react';
import { Download, Code2, Loader2 } from 'lucide-react';
import type { ColumnInfo, QueryResult } from '../../types/query';
import { useConnectionStore } from '../../stores/connectionStore';
import { useQueryProgress } from '../../hooks/useQueryProgress';
import { QuickSearchBar } from '../filter/quick-search-bar';

export type ActiveTab = 'results' | 'messages';

interface ResultToolbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  result: QueryResult | null;
  error: string | null;
  isTableMode: boolean;
  total: number;
  approximateCount?: number | null;
  quickSearchColumns?: ColumnInfo[];
  quickSearchTerm?: string;
  onQuickSearch?: (term: string, whereClause: string) => void;
  onQuickSearchClear?: () => void;
  onExport: () => void;
  onOpenQueryEditor?: () => void;
}

export function ResultToolbar({
  activeTab,
  onTabChange,
  result,
  error,
  isTableMode,
  total,
  approximateCount,
  quickSearchColumns = [],
  quickSearchTerm = '',
  onQuickSearch,
  onQuickSearchClear,
  onExport,
  onOpenQueryEditor,
}: ResultToolbarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const sessionId = useConnectionStore((s) =>
    selectedConnectionId ? s.sessionIds.get(selectedConnectionId) : undefined,
  );
  const queryProgress = useQueryProgress(sessionId ?? null);

  const tabCls = (tab: ActiveTab) =>
    `px-3 py-1 text-xs cursor-pointer border-b-2 ${
      activeTab === tab
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;

  return (
    <div
      className="flex items-center border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
      role="tablist"
      aria-label="Result panel tabs"
    >
      <button
        role="tab"
        aria-selected={activeTab === 'results'}
        className={tabCls('results')}
        onClick={() => onTabChange('results')}
      >
        Results
        {result && (
          <span className="ml-1.5 rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-700">
            {isTableMode
              ? (typeof approximateCount === 'number' && approximateCount > 0
                ? `~${approximateCount.toLocaleString()}`
                : total.toLocaleString())
              : result.rows.length}
          </span>
        )}
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'messages'}
        className={tabCls('messages')}
        onClick={() => onTabChange('messages')}
      >
        Messages
        {error && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-red-500 inline-block" aria-label="Error" />}
      </button>

      {isTableMode && onQuickSearch && onQuickSearchClear && (
        <QuickSearchBar
          columns={quickSearchColumns}
          value={quickSearchTerm}
          onSearch={onQuickSearch}
          onClear={onQuickSearchClear}
        />
      )}

      <div className="ml-auto flex items-center gap-2 px-3">
        {queryProgress.statusText && (
          <span className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-300">
            {queryProgress.isRunning && <Loader2 size={10} className="animate-spin" />}
            {queryProgress.error ? `Error: ${queryProgress.error}` : queryProgress.statusText}
          </span>
        )}
        {onOpenQueryEditor && (
          <button
            onClick={onOpenQueryEditor}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            title="Open SQL Query Editor"
          >
            <Code2 size={10} />
            Query Editor
          </button>
        )}
        {result && (
          <>
            <button
              onClick={onExport}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              title="Export results"
            >
              <Download size={10} />
              Export
            </button>
            <span className="text-[10px] text-zinc-400">
              {result.affectedRows > 0 && `${result.affectedRows} rows affected · `}
              {result.executionTimeMs.toFixed(1)}ms
            </span>
          </>
        )}
      </div>
    </div>
  );
}
