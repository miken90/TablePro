import React, { useState, useCallback } from 'react';
import { useQueryStore } from '../../stores/queryStore';
import { useChangeStore } from '../../stores/changeStore';
import { DataGrid } from './data-grid';
import { Pagination } from './pagination';
import { ChangeToolbar } from './change-toolbar';
import { EmptyState } from '../shared/EmptyState';
import { ExportDialog } from '../export/export-dialog';
import { Database, Download } from 'lucide-react';

type ActiveTab = 'results' | 'messages';

export function ResultPanel() {
  const { result, error, isExecuting, activeConnectionId, queryText } = useQueryStore();
  const { hasChanges, getChanges } = useChangeStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('results');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [showExport, setShowExport] = useState(false);

  const tabCls = (tab: ActiveTab) =>
    `px-3 py-1 text-xs cursor-pointer border-b-2 ${
      activeTab === tab
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;

  const handleRowSelect = useCallback(
    (rowIdx: number, mode: 'single' | 'range' | 'toggle') => {
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (mode === 'single') {
          next.clear();
          next.add(rowIdx);
          setLastSelectedRow(rowIdx);
        } else if (mode === 'toggle') {
          if (next.has(rowIdx)) {
            next.delete(rowIdx);
          } else {
            next.add(rowIdx);
          }
          setLastSelectedRow(rowIdx);
        } else if (mode === 'range') {
          const anchor = lastSelectedRow ?? rowIdx;
          const from = Math.min(anchor, rowIdx);
          const to = Math.max(anchor, rowIdx);
          for (let i = from; i <= to; i++) {
            next.add(i);
          }
        }
        return next;
      });
    },
    [lastSelectedRow]
  );

  const handleCellDoubleClick = useCallback((_rowIdx: number, _colIdx: number) => {
    // Cell editing handled by parent / future integration
  }, []);

  const handleSave = useCallback(() => {
    console.log('Save changes:', getChanges());
  }, [getChanges]);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    setSelectedRows(new Set());
    setLastSelectedRow(null);
  }, []);

  const handlePageSizeChange = useCallback((s: number) => {
    setPageSize(s);
    setPage(1);
    setSelectedRows(new Set());
    setLastSelectedRow(null);
  }, []);

  // Build change map for DataGrid (modified/inserted/deleted)
  const changeMap = new Map<number, 'modified' | 'inserted' | 'deleted'>();
  if (result) {
    const changes = getChanges();
    for (const [rowIdx, rowChange] of changes) {
      if (rowChange.type === 'update') changeMap.set(rowIdx, 'modified');
      else if (rowChange.type === 'insert') changeMap.set(rowIdx, 'inserted');
      else if (rowChange.type === 'delete') changeMap.set(rowIdx, 'deleted');
    }
  }

  const totalRows = result?.rows.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Change toolbar — shown above tab bar when there are unsaved changes */}
      {hasChanges && <ChangeToolbar onSave={handleSave} />}

      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
        <button className={tabCls('results')} onClick={() => setActiveTab('results')}>
          Results
          {result && (
            <span className="ml-1.5 rounded bg-zinc-200 px-1 py-0.5 text-[10px] dark:bg-zinc-700">
              {result.rows.length}
            </span>
          )}
        </button>
        <button className={tabCls('messages')} onClick={() => setActiveTab('messages')}>
          Messages
          {error && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />}
        </button>

        {result && (
          <div className="ml-auto flex items-center gap-2 px-3">
            <button
              onClick={() => setShowExport(true)}
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
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isExecuting && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Executing…
          </div>
        )}

        {!isExecuting && activeTab === 'results' && (
          <>
            <div className="flex-1 overflow-hidden">
              {result ? (
                <DataGrid
                  result={result}
                  selectedRows={selectedRows}
                  onRowSelect={handleRowSelect}
                  changedRows={changeMap}
                  onCellDoubleClick={handleCellDoubleClick}
                />
              ) : (
                <EmptyState icon={<Database size={24} />} message="Run a query to see results" />
              )}
            </div>

            {result && (
              <Pagination
                total={totalRows}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isExecuting}
              />
            )}
          </>
        )}

        {!isExecuting && activeTab === 'messages' && (
          <div className="h-full overflow-y-auto p-3">
            {error ? (
              <pre className="font-mono text-xs text-red-600 dark:text-red-400">{error}</pre>
            ) : result ? (
              <p className="text-xs text-green-600 dark:text-green-400">
                Query completed. {result.affectedRows} row(s) affected in{' '}
                {result.executionTimeMs.toFixed(1)}ms.
              </p>
            ) : (
              <p className="text-xs text-zinc-500">No messages</p>
            )}
          </div>
        )}
      </div>

      {/* Export dialog */}
      {showExport && result && activeConnectionId && (
        <ExportDialog
          sessionId={activeConnectionId}
          sql={queryText}
          result={result}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
