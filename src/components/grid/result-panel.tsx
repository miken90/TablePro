import React, { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useQueryStore } from '../../stores/queryStore';
import { useQueryLogStore } from '../../stores/queryLogStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useChangeStore } from '../../stores/changeStore';
import { useInspectorStore } from '../../stores/inspectorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useQueryProgress } from '../../hooks/useQueryProgress';
import { useCommandStore, getEffectiveBinding } from '../../hooks/useCommandRegistry';
import type { ColumnInfo } from '../../types/query';
import { DataGrid } from './data-grid';
import { isTextEntryTarget } from './is-text-entry-target';
import { Pagination } from './pagination';
import { ChangeToolbar } from './change-toolbar';
import { TruncationBanner } from './truncation-banner';
import { useQueryResultStore } from '../../stores/queryResultStore';
import { EmptyState } from '../shared/EmptyState';
import { ExportDialog } from '../export/export-dialog';
import { Database, Loader2 } from 'lucide-react';
import { ResultToolbar } from './result-toolbar';
import type { ActiveTab } from './result-toolbar';
import { ResultStatusBar } from './result-status-bar';
import { GridContextMenu } from './grid-context-menu';
import { ConfirmExecuteDialog } from './confirm-execute-dialog';
import { ConfirmRefreshDialog } from './confirm-refresh-dialog';
import { BulkInsertDialog } from './bulk-insert-dialog';
import { BulkUpdateDialog } from './bulk-update-dialog';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import { generatePreviewSql } from './sql-preview-popover';
import { PanelLoader } from '../shared/PanelLoader';
import { useTableData } from './hooks/use-table-data';
import { useChangeTracking } from './hooks/use-change-tracking';
import { useGridActions } from './hooks/use-grid-actions';

const ExplainPanel = lazy(() => import('../editor/explain-panel').then(m => ({ default: m.ExplainPanel })));

interface ResultPanelProps {
  tabId?: string;
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  activeWhereClause?: string;
  quickSearchColumns?: ColumnInfo[];
  onRowSelect?: (rowIndex: number | null) => void;
  onOpenQueryEditor?: () => void;
  /** Ref that receives the direct save function (bypasses confirm dialog). */
  onSaveRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Ref that receives the save-with-confirmation function. */
  onRequestSaveRef?: MutableRefObject<(() => void) | null>;
  /** Ref that receives the add-row function. */
  onAddRowRef?: MutableRefObject<(() => void) | null>;
  /** Ref that receives the delete-selected-rows function. */
  onDeleteSelectedRef?: MutableRefObject<(() => void) | null>;
  /** Ref that receives the clear-selection function. */
  onClearSelectionRef?: MutableRefObject<(() => void) | null>;
  /** Hide internal ChangeToolbar (when ContextualBar owns change actions). */
  hideChangeToolbar?: boolean;
}

export function ResultPanel({
  tabId, tableName, schema, sessionId,
  activeWhereClause, quickSearchColumns = [],
  onRowSelect: onRowSelectProp, onOpenQueryEditor, onSaveRef, onRequestSaveRef, onAddRowRef,
  onDeleteSelectedRef, onClearSelectionRef,
  hideChangeToolbar,
}: ResultPanelProps) {
  const queryResult = useQueryStore((s) => s.result);
  const queryError = useQueryStore((s) => s.error);
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const activeConnectionId = useQueryStore((s) => s.activeConnectionId);
  const queryText = useQueryStore((s) => s.queryText);
  const explainResult = useQueryStore((s) => s.explainResult);
  const explainSelectedAt = useQueryStore((s) => s.explainSelectedAt);
  const logEntries = useQueryLogStore((s) => s.entries);

  // Streaming columnar store (T5/T6/T8) — primary source for the live
  // query data grid. The legacy `useQueryStore.result` mirror is kept
  // populated post-stream for non-grid readers (Export, StatusBar).
  const columnar = useQueryResultStore((s) => s.columnar);
  const streaming = useQueryResultStore((s) => s.streaming);
  const streamError = useQueryResultStore((s) => s.streamError);
  const storeRowCount = columnar?.row_count ?? 0;

  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionIdForProgress = useConnectionStore((s) => s.getSessionId);
  const progressSessionId = selectedConnectionId ? getSessionIdForProgress(selectedConnectionId) : undefined;
  const queryProgress = useQueryProgress(progressSessionId ?? null);
  const clearInspectorData = useInspectorStore((s) => s.clearInspectorData);

  const isTableMode = !!tableName && !!sessionId;
  const [activeTab, setActiveTab] = useState<ActiveTab>('results');
  const lastAutoSwitchedErrorRef = React.useRef<string | null>(null);
  const [confirmExecuteOpen, setConfirmExecuteOpen] = useState(false);
  const [confirmRefreshOpen, setConfirmRefreshOpen] = useState(false);
  const [bulkInsertOpen, setBulkInsertOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // --- Hooks ---
  const tableData = useTableData({ tabId, tableName, schema, sessionId, activeWhereClause });
  const {
    tableResult, totalCount, approximateCount, isFetching, fetchError,
    page, pageSize, sorting, enumValuesByColumn, fkMap,
    setPage, setPageSize, setSorting, fetchTableData,
  } = tableData;

  // Query mode renders the full result. The grid is virtualized
  // (`data-grid.tsx` uses @tanstack/react-virtual), so DOM node count is
  // bound by the viewport, not by the row count — the old 500-row render
  // copy bounded nothing and its row count was the only number the footer
  // ever saw. Counters now read the store's real row count and the banner
  // reports the cap that actually dropped rows (the backend's).
  const result = isTableMode ? tableResult : queryResult;
  const error = isTableMode ? fetchError : (streamError ?? queryError);
  const total = isTableMode
    ? totalCount
    : (columnar ? storeRowCount : (queryResult?.rows.length ?? 0));
  const loading = isTableMode ? isFetching : (isExecuting || streaming);
  
  const exportSql = useMemo(() => {
    if (!isTableMode || !tableName) return queryText;
    const qualifiedTable = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
    const wherePart = activeWhereClause ? ` WHERE ${activeWhereClause}` : '';
    const orderBy = sorting && sorting.length > 0
      ? ' ORDER BY ' + sorting.map(s => `"${s.id}" ${s.desc ? 'DESC' : 'ASC'}`).join(', ')
      : '';
    return `SELECT * FROM ${qualifiedTable}${wherePart}${orderBy}`;
  }, [isTableMode, tableName, schema, activeWhereClause, sorting, queryText]);

  const changeTracking = useChangeTracking({
    tableName, schema, sessionId, result,
    fetchTableData, page, pageSize, activeWhereClause, sorting,
  });
  const {
    changesSnapshot, hasChanges, isSaving, saveError, dismissSaveError,
    handleSave, getEffectiveCellValue,
    changeMap, cellOverrides,
  } = changeTracking;

  // Build inserted display rows for table-browse mode (appended at end of current page)
  const insertedDisplayRows = useMemo(() => {
    if (!isTableMode || !tableResult) return [];
    return Object.values(changesSnapshot)
      .filter((c) => c.type === 'insert' && (c.originPage ?? page) === page)
      .sort((a, b) => b.rowIndex - a.rowIndex) // older inserts first (-Date.now ids: more negative = older)
      .map((change) => {
        const row = Array.from({ length: tableResult.columns.length }, (_, colIdx) => {
          const cell = change.cellChanges.find((cc) => cc.columnIndex === colIdx);
          return cell?.newValue ?? null;
        });
        return { rowId: change.rowIndex, row };
      });
  }, [isTableMode, tableResult, changesSnapshot, page]);

  // Compose display result with inserted rows appended (used by gridActions + DataGrid)
  const gridResult = useMemo(() => {
    if (!result || insertedDisplayRows.length === 0) return result;
    return {
      ...result,
      rows: [...result.rows, ...insertedDisplayRows.map((r) => r.row)],
    };
  }, [result, insertedDisplayRows]);

  // Build logical row id mapping (display index → changeStore row id)
  const displayRowIds = useMemo(() => {
    if (!isTableMode || !tableResult) return undefined;
    const ids = tableResult.rows.map((_, i) => i);
    for (const ir of insertedDisplayRows) ids.push(ir.rowId);
    return ids;
  }, [isTableMode, tableResult, insertedDisplayRows]);

  const gridActions = useGridActions({
    tabId, tableName, schema, sessionId, result: gridResult, isTableMode, page,
    rowIds: displayRowIds,
    getEffectiveCellValue, onRowSelectProp,
  });
  const {
    selectedRows, selection, selectionRect, selectCell,
    handleRowSelect,
    editingCell, handleCellDoubleClick, handleCellCommit, handleCellCancel,
    contextMenu, handleCellContextMenu, closeContextMenu,
    copySelectedRowsSql, copyContextRowTsv, copyContextCell, copyContextRowJson,
    duplicateContextRow, deleteContextRows, setContextCellNull, editContextCell,
    resetSelection,
    querySearchTerm, queryFilteredIndices,
    handleQueryQuickSearch, handleQueryQuickSearchClear,
    quickSearchTerm, handleQuickSearch, handleQuickSearchClear,
    handleFkNavigate, showExport, setShowExport,
    copySelection, pasteIntoSelectedRows,
    isDragging, extendTo, extendActive, beginDrag, updateDrag,
    selectColumn, selectAll,
  } = gridActions;

  // Build filtered rows for query mode when search is active
  const queryDisplayResult = useMemo(() => {
    if (isTableMode || !queryResult || !queryFilteredIndices) return queryResult;
    return { ...queryResult, rows: queryFilteredIndices.map((i) => queryResult.rows[i]) };
  }, [isTableMode, queryResult, queryFilteredIndices]);

  // Final display result: in table mode use gridResult (with inserts); in query mode use filtered
  const displayResult = isTableMode ? gridResult : (queryDisplayResult ?? queryResult);
  const filteredTotal = !isTableMode && queryFilteredIndices ? queryFilteredIndices.length : null;

  // Clear stale inspector data when result changes
  useEffect(() => { clearInspectorData(); }, [queryResult, tableResult, clearInspectorData]);

  // Expose save function to parent via ref
  useEffect(() => {
    if (onSaveRef) onSaveRef.current = handleSave;
    return () => { if (onSaveRef) onSaveRef.current = null; };
  }, [onSaveRef, handleSave]);

  // Auto-switch to Messages tab on error. The error arrives from a store
  // outside React, and the ref guard means the switch happens once per
  // distinct error rather than on every render, so the cascade the rule warns
  // about cannot occur here.
  useEffect(() => {
    if (error && !isTableMode && error !== lastAutoSwitchedErrorRef.current) {
      lastAutoSwitchedErrorRef.current = error;
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- store-sourced error, ref-guarded to fire once per distinct message */
      setActiveTab('messages');
    }
  }, [error, isTableMode]);

  // A fresh EXPLAIN plan selects its tab once. Consuming the store marker
  // (rather than a local ref) is what stops a later remount re-selecting it.
  useEffect(() => {
    if (explainSelectedAt == null || isTableMode) return;
    useQueryStore.setState({ explainSelectedAt: null });
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- store-sourced marker, consumed so it fires once per plan */
    setActiveTab('explain');
  }, [explainSelectedAt, isTableMode]);

  // Leaving the Explain tab dismisses the plan: the tab exists only while
  // there is one, so the panel owns the dismissal the old band's X did.
  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab((prev) => {
      if (prev === 'explain' && tab !== 'explain') useQueryStore.setState({ explainResult: null });
      return tab;
    });
  }, []);

  const currentFkColumns = tableName ? fkMap[tableName] : undefined;

  // --- Save / Refresh / Keyboard ---
  const handleRequestSave = useCallback(() => {
    if (!hasChanges || !tableName || !result || confirmExecuteOpen) return;
    setConfirmExecuteOpen(true);
  }, [hasChanges, tableName, result, confirmExecuteOpen]);

  // Expose request-save (with confirm dialog) to parent via ref
  useEffect(() => {
    if (onRequestSaveRef) onRequestSaveRef.current = handleRequestSave;
    return () => { if (onRequestSaveRef) onRequestSaveRef.current = null; };
  }, [onRequestSaveRef, handleRequestSave]);

  // Add row handler: inserts a blank row with negative id scoped to current page
  const handleAddRow = useCallback(() => {
    if (!result) return;
    const insertId = -Date.now();
    const defaults = result.columns.map(() => null);
    const columnNames = result.columns.map((c) => c.name);
    useChangeStore.getState().recordRowInsert(insertId, defaults, columnNames, page);
  }, [result, page]);

  // Expose add-row to parent via ref
  useEffect(() => {
    if (onAddRowRef) onAddRowRef.current = handleAddRow;
    return () => { if (onAddRowRef) onAddRowRef.current = null; };
  }, [onAddRowRef, handleAddRow]);

  // Expose delete-selected to parent via ref
  useEffect(() => {
    if (onDeleteSelectedRef) onDeleteSelectedRef.current = deleteContextRows;
    return () => { if (onDeleteSelectedRef) onDeleteSelectedRef.current = null; };
  }, [onDeleteSelectedRef, deleteContextRows]);

  // Expose clear-selection to parent via ref
  useEffect(() => {
    if (onClearSelectionRef) onClearSelectionRef.current = resetSelection;
    return () => { if (onClearSelectionRef) onClearSelectionRef.current = null; };
  }, [onClearSelectionRef, resetSelection]);

  // Sync selected row count to layout store for ContextualBar
  const setSelectedRowCount = useLayoutStore((s) => s.setSelectedRowCount);
  useEffect(() => {
    setSelectedRowCount(selectedRows.size);
    return () => { setSelectedRowCount(0); };
  }, [selectedRows, setSelectedRowCount]);

  const handleConfirmExecute = useCallback(async () => {
    setConfirmExecuteOpen(false);
    await handleSave();
  }, [handleSave]);

  const previewSql = useMemo(() => {
    if (!confirmExecuteOpen || !tableName || !result) return '';
    const columns = result.columns.map(c => c.name);
    const primaryKeys = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);
    return generatePreviewSql(changesSnapshot, tableName, schema, columns, primaryKeys, result.rows);
  }, [confirmExecuteOpen, changesSnapshot, tableName, schema, result]);

  const handleRefreshTable = useCallback(() => {
    if (!isTableMode || !sessionId || !tableName || isSaving) return;
    if (hasChanges) { setConfirmRefreshOpen(true); }
    else { fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting); }
  }, [isTableMode, sessionId, tableName, schema, hasChanges, isSaving, fetchTableData, page, pageSize, activeWhereClause, sorting]);

  const handleSaveAndRefresh = useCallback(async () => {
    setConfirmRefreshOpen(false);
    await handleSave();
  }, [handleSave]);

  const handleDiscardAndRefresh = useCallback(() => {
    setConfirmRefreshOpen(false);
    useChangeStore.getState().clear();
    if (sessionId && tableName) {
      fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
    }
  }, [sessionId, tableName, schema, fetchTableData, page, pageSize, activeWhereClause, sorting]);

  // Refresh table data after a bulk operation completes successfully
  const handleBulkSuccess = useCallback(() => {
    if (sessionId && tableName) {
      fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
    }
  }, [sessionId, tableName, schema, fetchTableData, page, pageSize, activeWhereClause, sorting]);

  // Keyboard: F5 refresh (table mode). Kept local because `app.refreshSchema`
  // is owned by the editor keymap; see useMainLayoutShortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F5' && isTableMode) { e.preventDefault(); handleRefreshTable(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTableMode, handleRefreshTable]);

  // Save and insert-row need this component's table context, so their handlers
  // are registered here and dispatched by the global shortcut hook. Registering
  // rather than binding keys directly keeps the user's custom bindings working
  // and keeps the command palette in sync.
  useEffect(() => {
    const register = useCommandStore.getState().registerCommand;
    const unregister = useCommandStore.getState().unregisterCommand;
    const shortcutFor = (id: string) => getEffectiveBinding(id)?.join('+');
    register({
      id: 'data.save',
      label: 'Save Changes',
      shortcut: shortcutFor('data.save'),
      category: 'Edit',
      // Mirror the handler's own preconditions so Ctrl+S is never swallowed
      // when there is nothing to save.
      when: () => isTableMode && hasChanges && !!tableName && !!result,
      action: handleRequestSave,
    });
    register({
      id: 'data.insertRow',
      label: 'Insert Row',
      shortcut: shortcutFor('data.insertRow'),
      category: 'Edit',
      when: () => isTableMode && !!result,
      action: handleAddRow,
    });
    return () => { unregister('data.save'); unregister('data.insertRow'); };
  }, [isTableMode, hasChanges, tableName, result, handleRequestSave, handleAddRow]);

  // Keyboard: Ctrl+C copy selection, Ctrl+V paste into selected rows, Delete key to delete selected rows
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // The listener is on `window`, so it also sees keys typed into the
      // filter box, the WHERE input, the quick search and the SQL editor.
      // Without this guard Backspace in any of them stopped editing text and
      // staged a row delete instead, and Ctrl+V never reached the input.
      if (isTextEntryTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !editingCell && selection.mode) {
        e.preventDefault();
        copySelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !editingCell && isTableMode && selectedRows.size > 0) {
        e.preventDefault();
        pasteIntoSelectedRows();
      }
      // Delete/Backspace deletes selected rows in table mode
      if ((e.key === 'Delete' || e.key === 'Backspace') && !editingCell && isTableMode && selectedRows.size > 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        deleteContextRows();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingCell, selection.mode, selectedRows, isTableMode, copySelection, pasteIntoSelectedRows, deleteContextRows]);

  // Composed sort/page handlers that reset selection
  const handleSortChange = useCallback((colName: string) => {
    setSorting(prev => {
      const existing = prev.find(s => s.id === colName);
      if (!existing) return [{ id: colName, desc: false }];
      if (!existing.desc) return [{ id: colName, desc: true }];
      return [];
    });
    resetSelection();
  }, [setSorting, resetSelection]);

  const handlePageChange = useCallback((p: number) => { setPage(p); resetSelection(); gridScrollRef.current?.scrollTo(0, 0); }, [setPage, resetSelection]);
  const handlePageSizeChange = useCallback((s: number) => { setPageSize(s); setPage(1); resetSelection(); gridScrollRef.current?.scrollTo(0, 0); }, [setPageSize, setPage, resetSelection]);

  return (
    <div className="flex h-full flex-col">
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-300">
          <span className="flex-1">Save failed: {saveError}</span>
          <button onClick={dismissSaveError} className="text-red-500 hover:text-red-700 dark:hover:text-red-200">Dismiss</button>
        </div>
      )}
      {hasChanges && tableName && !hideChangeToolbar && (
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
        onTabChange={handleTabChange}
        result={displayResult}
        error={error}
        isTableMode={isTableMode}
        hasExplain={!!explainResult}
        total={total}
        filteredTotal={filteredTotal}
        approximateCount={isTableMode ? approximateCount : null}
        quickSearchColumns={isTableMode ? (quickSearchColumns.length > 0 ? quickSearchColumns : (displayResult?.columns ?? [])) : (queryResult?.columns ?? [])}
        quickSearchTerm={isTableMode ? quickSearchTerm : querySearchTerm}
        onQuickSearch={isTableMode ? handleQuickSearch : handleQueryQuickSearch}
        onQuickSearchClear={isTableMode ? handleQuickSearchClear : handleQueryQuickSearchClear}
        onExport={() => setShowExport(true)}
        onOpenQueryEditor={onOpenQueryEditor}
        onRefresh={isTableMode ? handleRefreshTable : undefined}
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
              <div className="h-full w-1/3 animate-shimmer bg-accent-blue" />
            </div>
            <Loader2 size={20} className="animate-spin text-accent-blue" />
            <span className="text-xs text-text-secondary">
              {isTableMode ? 'Loading...' : `Executing… ${(queryProgress.elapsedMs / 1000).toFixed(1)}s`}
            </span>
          </div>
        )}
        {!loading && activeTab === 'results' && (
          <>
            <TruncationBanner />
            <div className="flex-1 overflow-hidden">
              {displayResult ? (
                <DataGrid
                  result={displayResult}
                  sessionId={sessionId ?? activeConnectionId ?? undefined}
                  pageOffset={0}
                  sorting={sorting}
                  onSortChange={handleSortChange}
                  selectedRows={selectedRows}
                  onRowSelect={handleRowSelect}
                  selection={selection}
                  selectionRect={selectionRect}
                  onCellClick={selectCell}
                  onRowHeaderClick={(rowId) => handleRowSelect(rowId, 'toggle')}
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
                  rowIds={displayRowIds}
                  onMoveActive={gridActions.moveActive}
                  onMoveNext={gridActions.moveNext}
                  onMovePrev={gridActions.movePrev}
                  onMoveToFirst={gridActions.moveToFirst}
                  onMoveToLast={gridActions.moveToLast}
                  onMoveToRowStart={gridActions.moveToRowStart}
                  onMoveToRowEnd={gridActions.moveToRowEnd}
                  onMoveActivePage={gridActions.moveActivePage}
                  onStartEditingActive={gridActions.startEditingActive}
                  onClearSelection={gridActions.clearSelection}
                  isDragging={isDragging}
                  onExtendTo={extendTo}
                  onExtendActive={extendActive}
                  onBeginDrag={beginDrag}
                  onUpdateDrag={updateDrag}
                  onSelectColumn={selectColumn}
                  onSelectAll={selectAll}
                  scrollRef={gridScrollRef}
                  isTableMode={isTableMode}
                />
              ) : (
                <EmptyState icon={<Database size={24} />} message="Run a query to see results" description="Press Ctrl+Enter to execute the current statement" />
              )}
            </div>
            {displayResult && (
              <Pagination
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                isLoading={loading}
                approximateCount={isTableMode ? approximateCount : null}
                rowsOnPage={tableResult?.rows.length ?? 0}
              />
            )}
          </>
        )}
        {!loading && activeTab === 'explain' && explainResult && (
          <Suspense fallback={<PanelLoader />}>
            <ExplainPanel result={explainResult} />
          </Suspense>
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
          onCopyAsJson={copyContextRowJson}
          isTableMode={isTableMode}
          onEditValue={isTableMode ? editContextCell : undefined}
          onSetNull={isTableMode ? setContextCellNull : undefined}
          onDuplicateRow={isTableMode ? duplicateContextRow : undefined}
          onDeleteRow={isTableMode ? deleteContextRows : undefined}
          isDeletedRow={changeMap.get(contextMenu.rowIndex) === 'deleted'}
          isPkColumn={result?.columns[contextMenu.colIndex]?.isPrimaryKey ?? false}
          selectionMode={selection.mode}
          onCopySelection={copySelection}
          onBulkInsert={isTableMode ? () => { closeContextMenu(); setBulkInsertOpen(true); } : undefined}
          onBulkUpdate={isTableMode ? () => { closeContextMenu(); setBulkUpdateOpen(true); } : undefined}
          onBulkDelete={isTableMode ? () => { closeContextMenu(); setBulkDeleteOpen(true); } : undefined}
          selectedRowCount={selectedRows.has(contextMenu.rowIndex) ? selectedRows.size : 1}
        />
      )}
      {showExport && displayResult && (sessionId || activeConnectionId) && (
        <ExportDialog
          sessionId={(sessionId || activeConnectionId)!}
          sql={exportSql}
          result={displayResult}
          onClose={() => setShowExport(false)}
        />
      )}
      <ConfirmExecuteDialog
        open={confirmExecuteOpen}
        sql={previewSql}
        statementCount={Object.keys(changesSnapshot).length}
        isSaving={isSaving}
        onExecute={handleConfirmExecute}
        onCancel={() => setConfirmExecuteOpen(false)}
      />
      <ConfirmRefreshDialog
        open={confirmRefreshOpen}
        changeCount={Object.keys(changesSnapshot).length}
        onSaveAndRefresh={handleSaveAndRefresh}
        onDiscardAndRefresh={handleDiscardAndRefresh}
        onCancel={() => setConfirmRefreshOpen(false)}
        isSaving={isSaving}
      />
      {isTableMode && sessionId && tableName && result && (
        <>
          <BulkInsertDialog
            open={bulkInsertOpen}
            sessionId={sessionId}
            table={tableName}
            schema={schema ?? null}
            columns={result.columns}
            onClose={() => setBulkInsertOpen(false)}
            onSuccess={handleBulkSuccess}
          />
          <BulkUpdateDialog
            open={bulkUpdateOpen}
            sessionId={sessionId}
            table={tableName}
            schema={schema ?? null}
            columns={result.columns}
            onClose={() => setBulkUpdateOpen(false)}
            onSuccess={handleBulkSuccess}
          />
          <BulkDeleteDialog
            open={bulkDeleteOpen}
            sessionId={sessionId}
            table={tableName}
            schema={schema ?? null}
            columns={result.columns}
            onClose={() => setBulkDeleteOpen(false)}
            onSuccess={handleBulkSuccess}
          />
        </>
      )}
    </div>
  );
}
