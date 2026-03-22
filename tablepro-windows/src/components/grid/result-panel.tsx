import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useQueryStore } from '../../stores/queryStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useEditorStore } from '../../stores/editorStore';
import { useQueryLogStore } from '../../stores/queryLogStore';
import { useFilterStore } from '../../stores/filterStore';
import {
  fetchApproximateCount,
  fetchCountFiltered,
  fetchEnumValues,
  fetchRowsFiltered,
  generateRowSql,
  type RowSqlFormat,
} from '../../ipc/commands';
import type { ColumnInfo, QueryResult } from '../../types/query';
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
import { GridContextMenu } from './grid-context-menu';
import { ConfirmExecuteDialog } from './confirm-execute-dialog';
import { ConfirmRefreshDialog } from './confirm-refresh-dialog';
import { generatePreviewSql } from './sql-preview-popover';
import { useChangeStore } from '../../stores/changeStore';

interface ResultPanelProps {
  tabId?: string;
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  activeWhereClause?: string;
  quickSearchColumns?: ColumnInfo[];
  onRowSelect?: (rowIndex: number | null) => void;
  onOpenQueryEditor?: () => void;
}

function buildOrderByClause(sorting: SortingState): string | null {
  if (sorting.length === 0) return null;
  return sorting.map(s => `"${s.id}" ${s.desc ? 'DESC' : 'ASC'}`).join(', ');
}

function toClipboardText(value: string | null): string {
  return value ?? '';
}

export function ResultPanel({
  tabId,
  tableName,
  schema,
  sessionId,
  activeWhereClause,
  quickSearchColumns = [],
  onRowSelect: onRowSelectProp,
  onOpenQueryEditor,
}: ResultPanelProps) {
  const queryResult = useQueryStore((s) => s.result);
  const queryError = useQueryStore((s) => s.error);
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const activeConnectionId = useQueryStore((s) => s.activeConnectionId);
  const queryText = useQueryStore((s) => s.queryText);

  // Quick search state — only active in table-browse mode (tabId provided)
  const setQuickSearch = useFilterStore((s) => s.setQuickSearch);
  const clearQuickSearch = useFilterStore((s) => s.clearQuickSearch);
  const quickSearchTerm = useFilterStore((s) =>
    tabId ? (s.byTab[tabId]?.quickSearchTerm ?? '') : '',
  );

  const handleQuickSearch = useCallback((term: string, whereClause: string) => {
    if (tabId) setQuickSearch(tabId, term, whereClause);
  }, [tabId, setQuickSearch]);

  const handleQuickSearchClear = useCallback(() => {
    if (tabId) clearQuickSearch(tabId);
  }, [tabId, clearQuickSearch]);

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
  const [approximateCount, setApproximateCount] = useState<number | null>(null);
  const [enumValuesByColumn, setEnumValuesByColumn] = useState<Record<string, string[]>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    rowIndex: number;
    colIndex: number;
    cellValue: string | null;
    row: (string | null)[];
  } | null>(null);

  // Server-side table data (when browsing a table)
  const [tableResult, setTableResult] = useState<QueryResult | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  const isTableMode = !!tableName && !!sessionId;
  const result = isTableMode ? tableResult : queryResult;
  const error = isTableMode ? fetchError : queryError;
  const total = isTableMode ? totalCount : (queryResult?.rows.length ?? 0);
  const loading = isTableMode ? isFetching : isExecuting;

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
      setApproximateCount(null);
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
    if (!isTableMode) {
      setTableResult(null);
      setTotalCount(0);
      setApproximateCount(null);
      return;
    }
    fetchTableData(sessionId!, tableName!, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
  }, [isTableMode, sessionId, tableName, schema, page, pageSize, activeWhereClause, sorting, fetchTableData]);

  const prevTableRef = useRef(tableName);
  const prevFilterRef = useRef(activeWhereClause);
  useEffect(() => {
    if (prevTableRef.current !== tableName) {
      setPage(1);
      setSorting([]);
      setSelectedRows(new Set());
      setEditingCell(null);
      setApproximateCount(null);
      setEnumValuesByColumn({});
      prevTableRef.current = tableName;
    }
    if (prevFilterRef.current !== activeWhereClause) {
      setPage(1);
      setSelectedRows(new Set());
      setEditingCell(null);
      prevFilterRef.current = activeWhereClause;
    }
  }, [tableName, activeWhereClause]);

  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId) return;
    fetchForeignKeysForTable(sessionId, tableName, schema ?? undefined);
  }, [isTableMode, sessionId, tableName, schema, fetchForeignKeysForTable]);

  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId) return;
    let cancelled = false;
    fetchApproximateCount(sessionId, tableName, schema ?? null)
      .then((count) => {
        if (!cancelled && Number.isFinite(count)) {
          setApproximateCount(count);
        }
      })
      .catch(() => {
        if (!cancelled) setApproximateCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isTableMode, sessionId, tableName, schema]);

  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId || !result) return;

    const enumColumns = result.columns.filter((col) => {
      const upper = col.typeName.toUpperCase();
      return upper.startsWith('ENUM') || upper.startsWith('SET');
    });

    if (enumColumns.length === 0) {
      setEnumValuesByColumn({});
      return;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        enumColumns.map(async (col) => {
          try {
            const values = await fetchEnumValues(sessionId, tableName, col.name, schema ?? null);
            return [col.name, values] as const;
          } catch {
            return [col.name, [] as string[]] as const;
          }
        }),
      );

      if (cancelled) return;
      const next: Record<string, string[]> = {};
      for (const [colName, values] of entries) {
        if (values.length > 0) next[colName] = values;
      }
      setEnumValuesByColumn(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [isTableMode, sessionId, tableName, schema, result]);

  const currentFkColumns = tableName ? fkMap[tableName] : undefined;

  const handleFkNavigate = useCallback((refTable: string, refColumn: string, refSchema: string | undefined, value: string) => {
    const escaped = value.replace(/'/g, "''");
    const qualifiedTable = refSchema ? `"${refSchema}"."${refTable}"` : `"${refTable}"`;
    const sql = `SELECT * FROM ${qualifiedTable} WHERE "${refColumn}" = '${escaped}'`;
    const tabId = useEditorStore.getState().addTab(refTable);
    useEditorStore.getState().updateTabContent(tabId, sql);
  }, []);

  const { isSaving, saveError, dismissSaveError, handleSave, changesSnapshot, recordCellChange } = useTableSave({
    tableName, schema, sessionId, result, fetchTableData, page, pageSize, activeWhereClause, sorting,
  });

  const [confirmExecuteOpen, setConfirmExecuteOpen] = useState(false);
  const [confirmRefreshOpen, setConfirmRefreshOpen] = useState(false);

  const hasChanges = useMemo(() => Object.keys(changesSnapshot).length > 0, [changesSnapshot]);

  const getEffectiveCellValue = useCallback((rowIdx: number, colIdx: number, fallback: string | null) => {
    const rowChange = changesSnapshot[rowIdx];
    if (!rowChange) return fallback;
    const override = rowChange.cellChanges.find((cc) => cc.columnIndex === colIdx);
    return override ? override.newValue : fallback;
  }, [changesSnapshot]);

  const handleRequestSave = useCallback(() => {
    if (!hasChanges || !tableName || !result || confirmExecuteOpen) return;
    setConfirmExecuteOpen(true);
  }, [hasChanges, tableName, result, confirmExecuteOpen]);

  const handleConfirmExecute = useCallback(async () => {
    setConfirmExecuteOpen(false);
    await handleSave();
  }, [handleSave]);

  const handleCancelExecute = useCallback(() => {
    setConfirmExecuteOpen(false);
  }, []);

  const previewSql = useMemo(() => {
    if (!confirmExecuteOpen || !tableName || !result) return '';
    const columns = result.columns.map(c => c.name);
    const primaryKeys = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);
    return generatePreviewSql(changesSnapshot, tableName, schema, columns, primaryKeys, result.rows);
  }, [confirmExecuteOpen, changesSnapshot, tableName, schema, result]);

  const handleRefreshTable = useCallback(() => {
    if (!isTableMode || !sessionId || !tableName || isSaving) return;
    if (hasChanges) {
      setConfirmRefreshOpen(true);
    } else {
      fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
    }
  }, [isTableMode, sessionId, tableName, schema, hasChanges, isSaving, fetchTableData, page, pageSize, activeWhereClause, sorting]);

  const handleSaveAndRefresh = useCallback(async () => {
    setConfirmRefreshOpen(false);
    await handleSave();
    // handleSave already calls fetchTableData on success
  }, [handleSave]);

  const handleDiscardAndRefresh = useCallback(() => {
    setConfirmRefreshOpen(false);
    useChangeStore.getState().clear();
    if (sessionId && tableName) {
      fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
    }
  }, [sessionId, tableName, schema, fetchTableData, page, pageSize, activeWhereClause, sorting]);

  const handleCancelRefresh = useCallback(() => {
    setConfirmRefreshOpen(false);
  }, []);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F5' && isTableMode) {
        e.preventDefault();
        handleRefreshTable();
      }
      // Ctrl+S — trigger save confirmation (table-browse mode only)
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey && isTableMode) {
        e.preventDefault();
        handleRequestSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTableMode, handleRefreshTable, handleRequestSave]);

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

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCellContextMenu = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement>,
      rowIdx: number,
      colIdx: number,
      cellValue: string | null,
      row: (string | null)[],
    ) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        rowIndex: rowIdx,
        colIndex: colIdx,
        cellValue,
        row,
      });
    },
    [],
  );

  const copySelectedRowsSql = useCallback(
    async (outputFormat: RowSqlFormat) => {
      if (!sessionId || !tableName || !result || !contextMenu) return;

      const rowIndexes = selectedRows.has(contextMenu.rowIndex)
        ? Array.from(selectedRows).sort((a, b) => a - b)
        : [contextMenu.rowIndex];

      const rows = rowIndexes.map((idx) => {
        const source = result.rows[idx] ?? [];
        return result.columns.map((_, colIdx) =>
          getEffectiveCellValue(idx, colIdx, source[colIdx] ?? null),
        );
      });

      const payload = {
        table: tableName,
        schema: schema ?? null,
        columns: result.columns.map((c) => c.name),
        primaryKeys: result.columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
        rows,
        outputFormat,
      };

      const sql = await generateRowSql(sessionId, payload);
      if (sql) {
        await navigator.clipboard.writeText(sql);
      }
      closeContextMenu();
    },
    [
      sessionId,
      tableName,
      result,
      contextMenu,
      selectedRows,
      schema,
      closeContextMenu,
      getEffectiveCellValue,
    ],
  );

  const copyContextRowTsv = useCallback(async () => {
    if (!contextMenu || !result) return;
    const row = result.columns
      .map((_, colIdx) =>
        toClipboardText(
          getEffectiveCellValue(contextMenu.rowIndex, colIdx, contextMenu.row[colIdx] ?? null),
        ),
      )
      .join('\t');
    await navigator.clipboard.writeText(row);
    closeContextMenu();
  }, [contextMenu, result, closeContextMenu, getEffectiveCellValue]);

  const copyContextCell = useCallback(async () => {
    if (!contextMenu) return;
    await navigator.clipboard.writeText(toClipboardText(contextMenu.cellValue));
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

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
      {hasChanges && tableName && (
        <ChangeToolbar
          onSave={handleRequestSave}
          tableName={tableName}
          schema={schema}
          columns={result?.columns.map(c => c.name)}
          primaryKeys={result?.columns.filter(c => c.isPrimaryKey).map(c => c.name)}
          rows={result?.rows}
        />
      )}
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
        approximateCount={isTableMode ? approximateCount : null}
        quickSearchColumns={isTableMode ? quickSearchColumns : []}
        quickSearchTerm={isTableMode ? quickSearchTerm : ''}
        onQuickSearch={isTableMode ? handleQuickSearch : undefined}
        onQuickSearchClear={isTableMode ? handleQuickSearchClear : undefined}
        onExport={() => setShowExport(true)}
        onOpenQueryEditor={onOpenQueryEditor}
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
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
                  onCellContextMenu={handleCellContextMenu}
                  enumValuesByColumn={enumValuesByColumn}
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
      {contextMenu && (
        <GridContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onCopyAsInsert={() => copySelectedRowsSql('INSERT')}
          onCopyAsUpdate={() => copySelectedRowsSql('UPDATE')}
          onCopyRowTsv={copyContextRowTsv}
          onCopyCell={copyContextCell}
        />
      )}
      {showExport && result && activeConnectionId && (
        <ExportDialog
          sessionId={activeConnectionId}
          sql={queryText}
          result={result}
          onClose={() => setShowExport(false)}
        />
      )}
      <ConfirmExecuteDialog
        open={confirmExecuteOpen}
        sql={previewSql}
        statementCount={Object.keys(changesSnapshot).length}
        isSaving={isSaving}
        onExecute={handleConfirmExecute}
        onCancel={handleCancelExecute}
      />
      <ConfirmRefreshDialog
        open={confirmRefreshOpen}
        changeCount={Object.keys(changesSnapshot).length}
        onSaveAndRefresh={handleSaveAndRefresh}
        onDiscardAndRefresh={handleDiscardAndRefresh}
        onCancel={handleCancelRefresh}
        isSaving={isSaving}
      />
    </div>
  );
}
