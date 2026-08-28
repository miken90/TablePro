import React from 'react';
import { Download, Code2, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ColumnInfo, QueryResult } from '../../types/query';
import { useConnectionStore } from '../../stores/connectionStore';
import { useQueryProgress } from '../../hooks/useQueryProgress';
import { QuickSearchBar } from '../filter/quick-search-bar';

export type ActiveTab = 'results' | 'explain' | 'messages';

interface ResultToolbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  result: QueryResult | null;
  error: string | null;
  isTableMode: boolean;
  /** True while an EXPLAIN plan is available; gates the Explain tab. */
  hasExplain?: boolean;
  /** Exact row count, or `null` when it could not be determined. */
  total: number | null;
  filteredTotal?: number | null;
  approximateCount?: number | null;
  quickSearchColumns?: ColumnInfo[];
  quickSearchTerm?: string;
  onQuickSearch?: (term: string, whereClause: string) => void;
  onQuickSearchClear?: () => void;
  onExport: () => void;
  onOpenQueryEditor?: () => void;
  onRefresh?: () => void;
}

export function ResultToolbar({
  activeTab,
  onTabChange,
  result,
  error,
  isTableMode,
  hasExplain = false,
  total,
  filteredTotal,
  approximateCount,
  quickSearchColumns = [],
  quickSearchTerm = '',
  onQuickSearch,
  onQuickSearchClear,
  onExport,
  onOpenQueryEditor,
  onRefresh,
}: ResultToolbarProps) {
  const { t } = useTranslation();
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const sessionId = useConnectionStore((s) =>
    selectedConnectionId ? s.sessionIds.get(selectedConnectionId) : undefined,
  );
  const queryProgress = useQueryProgress(sessionId ?? null);

  const showExplain = !isTableMode && hasExplain;

  // Defensive: force to 'results' tab in table-browse mode
  if (isTableMode && activeTab === 'messages') {
    onTabChange('results');
  }
  // The Explain tab owns dismissal: once the plan is cleared the tab is gone,
  // so a selection pointing at it has to fall back rather than render nothing.
  if (activeTab === 'explain' && !showExplain) {
    onTabChange('results');
  }

  const tabCls = (tab: ActiveTab) =>
    `px-3 py-1 text-xs cursor-pointer border-b-2 ${
      activeTab === tab
        ? 'border-accent-blue text-accent-blue'
        : 'border-transparent text-text-secondary hover:text-text-primary'
    }`;

  return (
    <div
      className="flex items-center border-b border-border-subtle bg-surface"
      role="tablist"
      aria-label="Result panel tabs"
    >
      <button
        role="tab"
        aria-selected={activeTab === 'results'}
        className={tabCls('results')}
        onClick={() => onTabChange('results')}
      >
        {t("common.results")}
        {result && (
          <span className="ml-1.5 rounded bg-surface-muted px-1 py-0.5 text-[10px]">
            {result.rows.length}
          </span>
        )}
      </button>
      {showExplain && (
        <button
          role="tab"
          aria-selected={activeTab === 'explain'}
          className={tabCls('explain')}
          onClick={() => onTabChange('explain')}
        >
          {t("explain.button")}
        </button>
      )}
      {!isTableMode && (
        <button
          role="tab"
          aria-selected={activeTab === 'messages'}
          className={tabCls('messages')}
          onClick={() => onTabChange('messages')}
        >
          {t("common.messages")}
          {error && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent-red inline-block" aria-label={t("common.error")} />}
        </button>
      )}

      {onQuickSearch && onQuickSearchClear && (
        <QuickSearchBar
          columns={quickSearchColumns}
          value={quickSearchTerm}
          onSearch={onQuickSearch}
          onClear={onQuickSearchClear}
        />
      )}

      <div className="ml-auto flex items-center gap-2 px-3">
        {queryProgress.statusText && (
          <span className="flex items-center gap-1 text-[10px] text-text-secondary">
            {queryProgress.isRunning && <Loader2 size={10} className="animate-spin" />}
            {queryProgress.error ? `Error: ${queryProgress.error}` : queryProgress.statusText}
          </span>
        )}
        {onOpenQueryEditor && (
          <button
            onClick={onOpenQueryEditor}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
            title={t("resultToolbar.queryEditor")}
          >
            <Code2 size={10} />
            {t("resultToolbar.queryEditor")}
          </button>
        )}
        {isTableMode && onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
            title="Refresh (F5)"
          >
            <RefreshCw size={10} />
          </button>
        )}
        {result && (
          <>
            <button
              onClick={onExport}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
              title={t("resultToolbar.exportResults")}
            >
              <Download size={10} />
              {t("common.export")}
            </button>
            <span className="text-[10px] text-text-secondary">
              {result.truncated && result.totalRowCount != null
                ? t("resultToolbar.truncatedRows", { count: result.rows.length.toLocaleString(), total: result.totalRowCount.toLocaleString() })
                : filteredTotal != null && filteredTotal !== total
                  ? t("resultToolbar.rowsOfTotal", { count: filteredTotal, total })
                  : isTableMode
                    ? (typeof approximateCount === 'number' && approximateCount > 0
                      ? t("resultToolbar.approximateRows", { count: approximateCount.toLocaleString() })
                      // `total === null` means the count query failed; say so
                      // rather than reporting a fabricated 0.
                      : total === null
                        ? t("resultToolbar.unknownRows")
                        : `${total.toLocaleString()} ${t("common.rows")}`)
                    : `${total ?? 0} ${t("common.rows")}`}
              {result.affectedRows > 0 && ` · ${result.affectedRows} ${t("common.affected")}`}
              {' · '}
              {result.executionTimeMs.toFixed(1)}ms
            </span>
          </>
        )}
      </div>
    </div>
  );
}
