import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useQueryStore } from '../../stores/queryStore';
import { useChangeStore } from '../../stores/changeStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useEditorStore } from '../../stores/editorStore';
import { fetchRowsFiltered, fetchCountFiltered, saveChanges } from '../../ipc/commands';
import type { SavePayload, RowChangePayload, CellChangePayload } from '../../ipc/commands';
import type { QueryResult } from '../../types/query';
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

function buildOrderByClause(sorting: SortingState): string | null {
  if (sorting.length === 0) return null;
  return sorting.map(s => `"${s.id}" ${s.desc ? 'DESC' : 'ASC'}`).join(', ');
}

export function ResultPanel({ tableName, schema, sessionId, activeWhereClause, onRowSelect: onRowSelectProp }: ResultPanelProps) {
  const { result: queryResult, error: queryError, isExecuting, activeConnectionId, queryText } = useQueryStore();
  const { hasChanges, getChanges, clear: clearChanges, recordCellChange } = useChangeStore();
  const { fkMap, fetchForeignKeysForTable } = useSchemaStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('results');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showExport, setShowExport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  // Server-side table data (when browsing a table)
  const [tableResult, setTableResult] = useState<QueryResult | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  // Are we in "table browse" mode vs "raw query" mode?
  const isTableMode = !!tableName && !!sessionId;

  // Fetch table data (server-side paging + sorting)
  const fetchTableData = useCallback(async (
    sid: string, tbl: string, sch: string | null,
    pg: number, ps: number, where: string | null, sort: SortingState,
  ) => {
    const seq = ++fetchSeqRef.current;
    setIsFetching(true);
    setFetchError(null);
    try {
      const offset = (pg - 1) * ps;
      const orderBy = buildOrderByClause(sort);
      const rows = await fetchRowsFiltered(sid, tbl, sch, offset, ps, where || null, orderBy);
      if (seq !== fetchSeqRef.current) return;
      let count = 0;
      try {
        count = await fetchCountFiltered(sid, tbl, sch, where || null);
      } catch {
        // Count fetch failed — show rows without total
      }
      if (seq !== fetchSeqRef.current) return;
      setTableResult(rows);
      setTotalCount(typeof count === 'number' ? count : 0);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setFetchError(err instanceof Error ? err.message : String(err));
      setTableResult(null);
      setTotalCount(0);
    } finally {
      if (seq === fetchSeqRef.current) setIsFetching(false);
    }
  }, []);

  // Re-fetch when table context, page, sort, or filter changes
  useEffect(() => {
    if (!isTableMode) {
      setTableResult(null);
      setTotalCount(0);
      return;
    }
    fetchTableData(sessionId!, tableName!, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
  }, [isTableMode, sessionId, tableName, schema, page, pageSize, activeWhereClause, sorting, fetchTableData]);

  // Reset page/sort when table or filter changes
  const prevTableRef = useRef(tableName);
  const prevFilterRef = useRef(activeWhereClause);
  useEffect(() => {
    if (prevTableRef.current !== tableName) {
      setPage(1);
      setSorting([]);
      setSelectedRows(new Set());
      setEditingCell(null);
      prevTableRef.current = tableName;
    }
    if (prevFilterRef.current !== activeWhereClause) {
      setPage(1);
      setSelectedRows(new Set());
      setEditingCell(null);
      prevFilterRef.current = activeWhereClause;
    }
  }, [tableName, activeWhereClause]);

  // Fetch FK metadata when table changes
  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId) return;
    fetchForeignKeysForTable(sessionId, tableName, schema ?? undefined);
  }, [isTableMode, sessionId, tableName, schema, fetchForeignKeysForTable]);

  // Get current table's FK column map
  const currentFkColumns = tableName ? fkMap[tableName] : undefined;

  // FK navigation: open a new editor tab with the FK query pre-filled
  const handleFkNavigate = useCallback((
    refTable: string,
    refColumn: string,
    refSchema: string | undefined,
    value: string,
  ) => {
    const escaped = value.replace(/'/g, "''");
    const qualifiedTable = refSchema ? `"${refSchema}"."${refTable}"` : `"${refTable}"`;
    const sql = `SELECT * FROM ${qualifiedTable} WHERE "${refColumn}" = '${escaped}'`;
    const tabId = useEditorStore.getState().addTab(refTable);
    useEditorStore.getState().updateTabContent(tabId, sql);
  }, []);

  // Pick which result + total to display
  const result = isTableMode ? tableResult : queryResult;
  const error = isTableMode ? fetchError : queryError;
  const total = isTableMode ? totalCount : (queryResult?.rows.length ?? 0);
  const loading = isTableMode ? isFetching : isExecuting;

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
          for (let i = from; i <= to; i++) next.add(i);
          onRowSelectProp?.(rowIdx);
        }
        return next;
      });
    },
    [lastSelectedRow, onRowSelectProp]
  );

  const handleCellDoubleClick = useCallback((rowIdx: number, colIdx: number) => {
    if (!tableName) return;
    setEditingCell({ rowIdx, colIdx });
  }, [tableName]);

  const handleCellCommit = useCallback((rowIdx: number, colIdx: number, newValue: string | null) => {
    if (!result) return;
    const col = result.columns[colIdx];
    // In table mode, rowIdx is the local index within the current page
    const oldValue = result.rows[rowIdx]?.[colIdx] ?? null;
    if (oldValue === newValue) {
      setEditingCell(null);
      return;
    }
    recordCellChange({
      rowIndex: rowIdx,
      columnIndex: colIdx,
      columnName: col.name,
      oldValue,
      newValue,
    });
    setEditingCell(null);
  }, [result, recordCellChange]);

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!tableName || !sessionId || !result) return;

    const changes = getChanges();
    if (changes.size === 0) return;

    const columns = result.columns.map(c => c.name);
    const primaryKeys = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);

    const rowChanges: RowChangePayload[] = [];
    for (const [rowIdx, change] of changes) {
      const originalRow = result.rows[rowIdx] ?? [];
      const cellChanges: CellChangePayload[] = change.cellChanges.map(cc => ({
        columnName: cc.columnName,
        oldValue: cc.oldValue ?? null,
        newValue: cc.newValue ?? null,
      }));

      let changeType: 'Insert' | 'Update' | 'Delete';
      if (change.type === 'insert') changeType = 'Insert';
      else if (change.type === 'delete') changeType = 'Delete';
      else changeType = 'Update';

      rowChanges.push({ changeType, originalRow, cellChanges });
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
      // Refresh current page after save
      fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [tableName, schema, sessionId, getChanges, result, clearChanges, fetchTableData, page, pageSize, activeWhereClause, sorting]);

  const handleSortChange = useCallback((colName: string) => {
    setSorting(prev => {
      const existing = prev.find(s => s.id === colName);
      if (!existing) return [{ id: colName, desc: false }];
      if (!existing.desc) return [{ id: colName, desc: true }];
      return [];
    });
    setPage(1);
    setSelectedRows(new Set());
    setEditingCell(null);
  }, []);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    setSelectedRows(new Set());
    setLastSelectedRow(null);
    setEditingCell(null);
  }, []);

  const handlePageSizeChange = useCallback((s: number) => {
    setPageSize(s);
    setPage(1);
    setSelectedRows(new Set());
    setLastSelectedRow(null);
    setEditingCell(null);
  }, []);

  // Build change map and cell override values for DataGrid
  const changeMap = new Map<number, 'modified' | 'inserted' | 'deleted'>();
  const cellOverrides = new Map<string, string | null>();
  if (result) {
    const changes = getChanges();
    for (const [rowIdx, rowChange] of changes) {
      if (rowChange.type === 'update') changeMap.set(rowIdx, 'modified');
      else if (rowChange.type === 'insert') changeMap.set(rowIdx, 'inserted');
      else if (rowChange.type === 'delete') changeMap.set(rowIdx, 'deleted');
      for (const cc of rowChange.cellChanges) {
        cellOverrides.set(`${rowIdx}:${cc.columnIndex}`, cc.newValue);
      }
    }
  }

  // For table mode, pageOffset is 0 since rows are already from server for this page
  // Row indices in DataGrid are local (0..pageSize)
  const pageOffset = 0;

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

      {hasChanges && tableName && <ChangeToolbar onSave={handleSave} />}

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
              {isTableMode ? total.toLocaleString() : result.rows.length}
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
        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {isTableMode ? 'Loading...' : 'Executing...'}
          </div>
        )}

        {!loading && activeTab === 'results' && (
          <>
            <div className="flex-1 overflow-hidden">
              {result ? (
                <DataGrid
                  result={result}
                  pageOffset={pageOffset}
                  sorting={sorting}
                  onSortChange={handleSortChange}
                  selectedRows={selectedRows}
                  onRowSelect={handleRowSelect}
                  changedRows={changeMap}
                  cellOverrideValues={cellOverrides}
                  editingCell={editingCell}
                  onCellDoubleClick={handleCellDoubleClick}
                  onCellCommit={handleCellCommit}
                  onCellCancel={handleCellCancel}
                  fkColumns={currentFkColumns}
                  onFkNavigate={handleFkNavigate}
                />
              ) : (
                <EmptyState icon={<Database size={24} />} message="Run a query to see results" />
              )}
            </div>

            {result && (
              <Pagination
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={loading}
              />
            )}
          </>
        )}

        {!loading && activeTab === 'messages' && (
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
