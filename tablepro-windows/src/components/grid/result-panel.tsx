import React, { useState, useCallback } from 'react';
import { useQueryStore } from '../../stores/queryStore';
import { useChangeStore } from '../../stores/changeStore';
import { saveChanges } from '../../ipc/commands';
import type { SavePayload, RowChangePayload, CellChangePayload } from '../../ipc/commands';
import { DataGrid } from './data-grid';
import { Pagination } from './pagination';
import { ChangeToolbar } from './change-toolbar';
import { EmptyState } from '../shared/EmptyState';
import { ExportDialog } from '../export/export-dialog';
import { Database, Download } from 'lucide-react';

type ActiveTab = 'results' | 'messages';

interface ResultPanelProps {
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  activeWhereClause?: string;
  onRowSelect?: (rowIndex: number | null) => void;
}

export function ResultPanel({ tableName, schema, sessionId, activeWhereClause, onRowSelect: onRowSelectProp }: ResultPanelProps) {
  const { result, error, isExecuting, activeConnectionId, queryText } = useQueryStore();
  const { hasChanges, getChanges, clear: clearChanges } = useChangeStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('results');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [showExport, setShowExport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
          onRowSelectProp?.(rowIdx);
        } else if (mode === 'toggle') {
          if (next.has(rowIdx)) {
            next.delete(rowIdx);
            onRowSelectProp?.(null);
          } else {
            next.add(rowIdx);
            onRowSelectProp?.(rowIdx);
          }
          setLastSelectedRow(rowIdx);
        } else if (mode === 'range') {
          const anchor = lastSelectedRow ?? rowIdx;
          const from = Math.min(anchor, rowIdx);
          const to = Math.max(anchor, rowIdx);
          for (let i = from; i <= to; i++) {
            next.add(i);
          }
          // For range select, show the last row in inspector
          onRowSelectProp?.(rowIdx);
        }
        return next;
      });
    },
    [lastSelectedRow, onRowSelectProp]
  );

  const handleCellDoubleClick = useCallback((_rowIdx: number, _colIdx: number) => {
    // Cell editing handled by parent / future integration
  }, []);

  const handleSave = useCallback(async () => {
    if (!tableName || !sessionId) return;

    const changes = getChanges();
    if (changes.size === 0) return;

    const columns = result?.columns.map(c => c.name) ?? [];
    const primaryKeys = result?.columns.filter(c => c.isPrimaryKey).map(c => c.name) ?? [];

    const rowChanges: RowChangePayload[] = [];
    for (const [rowIdx, change] of changes) {
      const originalRow = result?.rows[rowIdx] ?? [];
      const cellChanges: CellChangePayload[] = change.cellChanges.map(cc => ({
        columnName: cc.columnName,
        oldValue: cc.oldValue ?? null,
        newValue: cc.newValue ?? null,
      }));

      let changeType: 'Insert' | 'Update' | 'Delete';
      if (change.type === 'insert') changeType = 'Insert';
      else if (change.type === 'delete') changeType = 'Delete';
      else changeType = 'Update';

      rowChanges.push({
        changeType,
        originalRow,
        cellChanges,
      });
    }

    const payload: SavePayload = {
      table: tableName,
      schema: schema ?? null,
      columns,
      primaryKeys,
      changes: rowChanges,
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      await saveChanges(sessionId, payload);
      clearChanges();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg);
      console.error('Failed to save changes:', err);
    } finally {
      setIsSaving(false);
    }
  }, [tableName, schema, sessionId, getChanges, result, clearChanges]);

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
      {/* Save error banner */}
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-300">
          <span className="flex-1">Save failed: {saveError}</span>
          <button
            onClick={() => setSaveError(null)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Change toolbar — only when editing a table (not raw queries) */}
      {hasChanges && tableName && <ChangeToolbar onSave={handleSave} />}

      {/* Saving indicator */}
      {isSaving && (
        <div className="px-3 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700">
          Saving changes...
        </div>
      )}

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
            Executing...
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
