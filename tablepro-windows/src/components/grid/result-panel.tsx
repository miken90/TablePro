import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useQueryStore } from '../../stores/queryStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useEditorStore } from '../../stores/editorStore';
import { useQueryLogStore } from '../../stores/queryLogStore';
import { fetchRowsFiltered, fetchCountFiltered } from '../../ipc/commands';
import type { QueryResult } from '../../types/query';
import { DataGrid } from './data-grid';
import { Pagination } from './pagination';
import { ChangeToolbar } from './change-toolbar';
import { EmptyState } from '../shared/EmptyState';
import { ExportDialog } from '../export/export-dialog';
import { Database } from 'lucide-react';
import { ResultToolbar } from './result-toolbar';
import type { ActiveTab } from './result-toolbar';
import { ResultStatusBar } from './result-status-bar';
import { useTableSave } from './use-table-save';

interface ResultPanelProps {
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  activeWhereClause?: string;
  onRowSelect?: (rowIndex: number | null) => void;
  onOpenQueryEditor?: () => void;
}

function buildOrderByClause(sorting: SortingState): string | null {
  if (sorting.length === 0) return null;
  return sorting.map(s => `"${s.id}" ${s.desc ? 'DESC' : 'ASC'}`).join(', ');
}

export function ResultPanel({ tableName, schema, sessionId, activeWhereClause, onRowSelect: onRowSelectProp, onOpenQueryEditor }: ResultPanelProps) {
  const queryResult = useQueryStore((s) => s.result);
  const queryError = useQueryStore((s) => s.error);
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const activeConnectionId = useQueryStore((s) => s.activeConnectionId);
  const queryText = useQueryStore((s) => s.queryText);

  const fkMap = useSchemaStore((s) => s.fkMap);
  const fetchForeignKeysForTable = useSchemaStore((s) => s.fetchForeignKeysForTable);
  const logEntries = useQueryLogStore((s) => s.entries);

  const [activeTab, setActiveTab] = useState<ActiveTab>('results');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showExport, setShowExport] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  // Server-side table data (when browsing a table)
  const [tableResult, setTableResult] = useState<QueryResult | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  const isTableMode = !!tableName && !!sessionId;

  const fetchTableData = useCallback(async (
    sid: string, tbl: string, sch: string | null,
    pg: number, ps: number, where: string | null, sort: SortingState,
  ) => {
    const seq = ++fetchSeqRef.current;
    setIsFetching(true);
    setFetchError(null);
    const offset = (pg - 1) * ps;
    const orderBy = buildOrderByClause(sort);
    const qualifiedTable = sch ? `"${sch}"."${tbl}"` : `"${tbl}"`;
    const wherePart = where ? ` WHERE ${where}` : '';
    const orderPart = orderBy ? ` ORDER BY ${orderBy}` : '';
    const logSql = `SELECT * FROM ${qualifiedTable}${wherePart}${orderPart} LIMIT ${ps} OFFSET ${offset}`;
    const logId = useQueryLogStore.getState().add({ sql: logSql, source: 'table-browse', status: 'running', timestamp: Date.now() });
    const startMs = Date.now();
    try {
      const rows = await fetchRowsFiltered(sid, tbl, sch, offset, ps, where || null, orderBy);
      if (seq !== fetchSeqRef.current) return;
      let count = 0;
      try { count = await fetchCountFiltered(sid, tbl, sch, where || null); } catch { /* ignore */ }
      if (seq !== fetchSeqRef.current) return;
      setTableResult(rows);
      setTotalCount(typeof count === 'number' ? count : 0);
      useQueryLogStore.getState().update(logId, { status: 'success', durationMs: Date.now() - startMs, rowCount: rows.rows.length });
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      setFetchError(errorMsg);
      setTableResult(null);
      setTotalCount(0);
      useQueryLogStore.getState().update(logId, { status: 'error', durationMs: Date.now() - startMs, error: errorMsg });
    } finally {
      if (seq === fetchSeqRef.current) setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!isTableMode) { setTableResult(null); setTotalCount(0); return; }
    fetchTableData(sessionId!, tableName!, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
  }, [isTableMode, sessionId, tableName, schema, page, pageSize, activeWhereClause, sorting, fetchTableData]);

  const prevTableRef = useRef(tableName);
  const prevFilterRef = useRef(activeWhereClause);
  useEffect(() => {
    if (prevTableRef.current !== tableName) {
      setPage(1); setSorting([]); setSelectedRows(new Set()); setEditingCell(null);
      prevTableRef.current = tableName;
    }
    if (prevFilterRef.current !== activeWhereClause) {
      setPage(1); setSelectedRows(new Set()); setEditingCell(null);
      prevFilterRef.current = activeWhereClause;
    }
  }, [tableName, activeWhereClause]);

  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId) return;
    fetchForeignKeysForTable(sessionId, tableName, schema ?? undefined);
  }, [isTableMode, sessionId, tableName, schema, fetchForeignKeysForTable]);

  const currentFkColumns = tableName ? fkMap[tableName] : undefined;

  const handleFkNavigate = useCallback((refTable: string, refColumn: string, refSchema: string | undefined, value: string) => {
    const escaped = value.replace(/'/g, "''");
    const qualifiedTable = refSchema ? `"${refSchema}"."${refTable}"` : `"${refTable}"`;
    const sql = `SELECT * FROM ${qualifiedTable} WHERE "${refColumn}" = '${escaped}'`;
    const tabId = useEditorStore.getState().addTab(refTable);
    useEditorStore.getState().updateTabContent(tabId, sql);
  }, []);

  const result = isTableMode ? tableResult : queryResult;
  const error = isTableMode ? fetchError : queryError;
  const total = isTableMode ? totalCount : (queryResult?.rows.length ?? 0);
  const loading = isTableMode ? isFetching : isExecuting;

  const { isSaving, saveError, dismissSaveError, handleSave, changesSnapshot, recordCellChange } = useTableSave({
    tableName, schema, sessionId, result, fetchTableData, page, pageSize, activeWhereClause, sorting,
  });

  const hasChanges = useMemo(() => Object.keys(changesSnapshot).length > 0, [changesSnapshot]);

  const handleRowSelect = useCallback((rowIdx: number, mode: 'single' | 'range' | 'toggle') => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (mode === 'single') {
        next.clear(); next.add(rowIdx); setLastSelectedRow(rowIdx); onRowSelectProp?.(rowIdx);
      } else if (mode === 'toggle') {
        if (next.has(rowIdx)) { next.delete(rowIdx); onRowSelectProp?.(null); }
        else { next.add(rowIdx); onRowSelectProp?.(rowIdx); }
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
  }, [lastSelectedRow, onRowSelectProp]);

  const handleCellDoubleClick = useCallback((rowIdx: number, colIdx: number) => {
    if (!tableName) return;
    setEditingCell({ rowIdx, colIdx });
  }, [tableName]);

  const handleCellCommit = useCallback((rowIdx: number, colIdx: number, newValue: string | null) => {
    if (!result) return;
    const col = result.columns[colIdx];
    const oldValue = result.rows[rowIdx]?.[colIdx] ?? null;
    if (oldValue === newValue) { setEditingCell(null); return; }
    recordCellChange({ rowIndex: rowIdx, columnIndex: colIdx, columnName: col.name, oldValue, newValue });
    setEditingCell(null);
  }, [result, recordCellChange]);

  const handleCellCancel = useCallback(() => setEditingCell(null), []);

  const handleSortChange = useCallback((colName: string) => {
    setSorting(prev => {
      const existing = prev.find(s => s.id === colName);
      if (!existing) return [{ id: colName, desc: false }];
      if (!existing.desc) return [{ id: colName, desc: true }];
      return [];
    });
    setPage(1); setSelectedRows(new Set()); setEditingCell(null);
  }, []);

  const handlePageChange = useCallback((p: number) => {
    setPage(p); setSelectedRows(new Set()); setLastSelectedRow(null); setEditingCell(null);
  }, []);

  const handlePageSizeChange = useCallback((s: number) => {
    setPageSize(s); setPage(1); setSelectedRows(new Set()); setLastSelectedRow(null); setEditingCell(null);
  }, []);

  const changeMap = useMemo(() => {
    const map = new Map<number, 'modified' | 'inserted' | 'deleted'>();
    if (!result) return map;
    for (const [rowIdxStr, rowChange] of Object.entries(changesSnapshot)) {
      const rowIdx = Number(rowIdxStr);
      if (rowChange.type === 'update') map.set(rowIdx, 'modified');
      else if (rowChange.type === 'insert') map.set(rowIdx, 'inserted');
      else if (rowChange.type === 'delete') map.set(rowIdx, 'deleted');
    }
    return map;
  }, [result, changesSnapshot]);

  const cellOverrides = useMemo(() => {
    const overrides = new Map<string, string | null>();
    if (!result) return overrides;
    for (const [rowIdxStr, rowChange] of Object.entries(changesSnapshot)) {
      const rowIdx = Number(rowIdxStr);
      for (const cc of rowChange.cellChanges) {
        overrides.set(`${rowIdx}:${cc.columnIndex}`, cc.newValue);
      }
    }
    return overrides;
  }, [result, changesSnapshot]);

  return (
    <div className="flex h-full flex-col">
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-300">
          <span className="flex-1">Save failed: {saveError}</span>
          <button onClick={dismissSaveError} className="text-red-500 hover:text-red-700 dark:hover:text-red-200">Dismiss</button>
        </div>
      )}
      {hasChanges && tableName && <ChangeToolbar onSave={handleSave} />}
      {isSaving && (
        <div className="px-3 py-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700">
          Saving changes...
        </div>
      )}
      <ResultToolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        result={result}
        error={error}
        isTableMode={isTableMode}
        total={total}
        onExport={() => setShowExport(true)}
        onOpenQueryEditor={onOpenQueryEditor}
      />
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
                  pageOffset={0}
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
        {!loading && activeTab === 'messages' && <ResultStatusBar logEntries={logEntries} />}
      </div>
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
