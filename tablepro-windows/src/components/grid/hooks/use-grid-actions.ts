import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFilterStore } from '../../../stores/filterStore';
import { useEditorStore } from '../../../stores/editorStore';
import { useInspectorStore } from '../../../stores/inspectorStore';
import { useChangeStore } from '../../../stores/changeStore';
import { generateRowSql, type RowSqlFormat } from '../../../ipc/commands';
import type { ColumnInfo, QueryResult } from '../../../types/query';
import type { FkRef } from '../../../stores/schemaStore';
import FilterWorker from '../../../workers/filter-worker?worker';

interface UseGridActionsProps {
  tabId?: string;
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  result: QueryResult | null;
  isTableMode: boolean;
  page?: number;
  /** Maps logical row id → display index in result.rows. Required when inserted rows are appended. */
  rowIds?: number[];
  getEffectiveCellValue: (rowIdx: number, colIdx: number, fallback: string | null) => string | null;
  onRowSelectProp?: (rowIndex: number | null) => void;
}

function toClipboardText(value: string | null): string {
  return value ?? '';
}

export interface UseGridActionsReturn {
  // Selection
  selectedRows: Set<number>;
  lastSelectedRow: number | null;
  handleRowSelect: (rowIdx: number, mode: 'single' | 'range' | 'toggle') => void;
  // Editing
  editingCell: { rowIdx: number; colIdx: number } | null;
  handleCellDoubleClick: (rowIdx: number, colIdx: number) => void;
  handleCellCommit: (rowIdx: number, colIdx: number, newValue: string | null) => void;
  handleCellCancel: () => void;
  // Context menu
  contextMenu: { x: number; y: number; rowIndex: number; colIndex: number; cellValue: string | null; row: (string | null)[] } | null;
  handleCellContextMenu: (event: React.MouseEvent<HTMLDivElement>, rowIdx: number, colIdx: number, cellValue: string | null, row: (string | null)[]) => void;
  closeContextMenu: () => void;
  copySelectedRowsSql: (outputFormat: RowSqlFormat) => Promise<void>;
  copyContextRowTsv: () => Promise<void>;
  copyContextCell: () => Promise<void>;
  copyContextRowJson: () => Promise<void>;
  // Table-browse editing actions
  duplicateContextRow: () => void;
  deleteContextRows: () => void;
  setContextCellNull: () => void;
  editContextCell: () => void;
  // Selection reset (call when sort/page changes)
  resetSelection: () => void;
  // Quick search (query mode)
  querySearchTerm: string;
  queryFilteredIndices: number[] | null;
  handleQueryQuickSearch: (term: string, whereClause: string) => void;
  handleQueryQuickSearchClear: () => void;
  // Quick search (table mode)
  quickSearchTerm: string;
  handleQuickSearch: (term: string, whereClause: string) => void;
  handleQuickSearchClear: () => void;
  // FK navigate
  handleFkNavigate: (refTable: string, refColumn: string, refSchema: string | undefined, value: string) => void;
  // Export
  showExport: boolean;
  setShowExport: (v: boolean) => void;
  // Copy selected rows as TSV (Ctrl+C)
  copySelectedRowsTsv: () => Promise<void>;
}

export function useGridActions({
  tabId, tableName, schema, sessionId, result, isTableMode, page, rowIds,
  getEffectiveCellValue, onRowSelectProp,
}: UseGridActionsProps): UseGridActionsReturn {
  // Selection state
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [showExport, setShowExport] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; rowIndex: number; colIndex: number; cellValue: string | null; row: (string | null)[];
  } | null>(null);

  // Quick search (table mode)
  const setQuickSearch = useFilterStore((s) => s.setQuickSearch);
  const clearQuickSearch = useFilterStore((s) => s.clearQuickSearch);
  const quickSearchTerm = useFilterStore((s) =>
    tabId ? (s.byTab[tabId]?.quickSearchTerm ?? '') : '',
  );

  // Client-side quick search (query mode)
  const [querySearchTerm, setQuerySearchTerm] = useState('');
  const [queryFilteredIndices, setQueryFilteredIndices] = useState<number[] | null>(null);
  const filterWorkerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inspector
  const setInspectorData = useInspectorStore((s) => s.setInspectorData);

  // Helper: map logical row id → display index in result.rows
  const getDisplayIdx = useCallback((logicalId: number): number => {
    if (!rowIds) return logicalId;
    const idx = rowIds.indexOf(logicalId);
    return idx >= 0 ? idx : logicalId;
  }, [rowIds]);

  // Helper: get row data by logical row id
  const getRowByLogicalId = useCallback((logicalId: number): (string | null)[] | undefined => {
    return result?.rows[getDisplayIdx(logicalId)];
  }, [result, getDisplayIdx]);

  useEffect(() => {
    const worker = new FilterWorker();
    filterWorkerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'filter-result') {
        setQueryFilteredIndices(e.data.indices);
      }
    };
    return () => { worker.terminate(); filterWorkerRef.current = null; };
  }, []);

  // Reset filter on result change
  useEffect(() => {
    if (filterWorkerRef.current && result && !isTableMode) {
      filterWorkerRef.current.postMessage({ type: 'set-rows', rows: result.rows });
    }
    setQueryFilteredIndices(null);
    setQuerySearchTerm('');
  }, [result, isTableMode]);

  // Reset selection on table/filter change
  const prevTableRef = useRef(tableName);
  const prevFilterRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevTableRef.current !== tableName || prevFilterRef.current !== undefined) {
      setSelectedRows(new Set());
      setEditingCell(null);
    }
    prevTableRef.current = tableName;
  }, [tableName]);

  const handleQueryQuickSearch = useCallback((term: string, _whereClause: string) => {
    setQuerySearchTerm(term);
    if (!term.trim()) {
      setQueryFilteredIndices(null);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      filterWorkerRef.current?.postMessage({ type: 'filter', term });
    }, 200);
  }, []);

  const handleQueryQuickSearchClear = useCallback(() => {
    setQuerySearchTerm('');
    setQueryFilteredIndices(null);
  }, []);

  const handleQuickSearch = useCallback((term: string, whereClause: string) => {
    if (tabId) setQuickSearch(tabId, term, whereClause);
  }, [tabId, setQuickSearch]);

  const handleQuickSearchClear = useCallback(() => {
    if (tabId) clearQuickSearch(tabId);
  }, [tabId, clearQuickSearch]);

  const handleRowSelect = useCallback((rowIdx: number, mode: 'single' | 'range' | 'toggle') => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (mode === 'single') {
        next.clear(); next.add(rowIdx); setLastSelectedRow(rowIdx); onRowSelectProp?.(rowIdx);
        if (result) setInspectorData(result.columns, getRowByLogicalId(rowIdx) ?? null);
      } else if (mode === 'toggle') {
        if (next.has(rowIdx)) { next.delete(rowIdx); onRowSelectProp?.(null); }
        else { next.add(rowIdx); onRowSelectProp?.(rowIdx); if (result) setInspectorData(result.columns, getRowByLogicalId(rowIdx) ?? null); }
        setLastSelectedRow(rowIdx);
      } else if (mode === 'range') {
        const anchor = lastSelectedRow ?? rowIdx;
        const from = Math.min(anchor, rowIdx);
        const to = Math.max(anchor, rowIdx);
        for (let i = from; i <= to; i++) next.add(i);
        onRowSelectProp?.(rowIdx);
        if (result) setInspectorData(result.columns, getRowByLogicalId(rowIdx) ?? null);
      }
      return next;
    });
  }, [lastSelectedRow, onRowSelectProp, result, setInspectorData, getRowByLogicalId]);

  const handleCellDoubleClick = useCallback((rowIdx: number, colIdx: number) => {
    if (!tableName) {
      const cellValue = getRowByLogicalId(rowIdx)?.[colIdx] ?? null;
      navigator.clipboard.writeText(cellValue ?? '').catch(() => {});
      return;
    }
    setEditingCell({ rowIdx, colIdx });
  }, [tableName, getRowByLogicalId]);

  const recordCellChange = useChangeStore((s) => s.recordCellChange);

  const handleCellCommit = useCallback((rowIdx: number, colIdx: number, newValue: string | null) => {
    if (!result) return;
    const col = result.columns[colIdx];
    const oldValue = getRowByLogicalId(rowIdx)?.[colIdx] ?? null;
    if (oldValue === newValue) { setEditingCell(null); return; }
    const originalRowSnapshot = getRowByLogicalId(rowIdx) ?? [];
    recordCellChange(
      { rowIndex: rowIdx, columnIndex: colIdx, columnName: col.name, oldValue, newValue },
      originalRowSnapshot,
    );
    setEditingCell(null);
  }, [result, recordCellChange, getRowByLogicalId]);

  const handleCellCancel = useCallback(() => setEditingCell(null), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCellContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, rowIdx: number, colIdx: number, cellValue: string | null, row: (string | null)[]) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, rowIndex: rowIdx, colIndex: colIdx, cellValue, row });
    }, [],
  );

  const copySelectedRowsSql = useCallback(
    async (outputFormat: RowSqlFormat) => {
      if (!sessionId || !tableName || !result || !contextMenu) return;
      const rowIndexes = selectedRows.has(contextMenu.rowIndex)
        ? Array.from(selectedRows).sort((a, b) => a - b)
        : [contextMenu.rowIndex];
      const rows = rowIndexes.map((idx) => {
        const source = getRowByLogicalId(idx) ?? [];
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
      if (sql) await navigator.clipboard.writeText(sql);
      closeContextMenu();
    },
    [sessionId, tableName, result, contextMenu, selectedRows, schema, closeContextMenu, getEffectiveCellValue, getRowByLogicalId],
  );

  const copyContextRowTsv = useCallback(async () => {
    if (!contextMenu || !result) return;
    const row = result.columns
      .map((_, colIdx) =>
        toClipboardText(getEffectiveCellValue(contextMenu.rowIndex, colIdx, contextMenu.row[colIdx] ?? null)),
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

  // 6.1: Copy Row as JSON (compact)
  const copyContextRowJson = useCallback(async () => {
    if (!contextMenu || !result) return;
    const row = getRowByLogicalId(contextMenu.rowIndex);
    if (!row) { closeContextMenu(); return; }
    const obj: Record<string, string | null> = {};
    result.columns.forEach((col, i) => {
      obj[col.name] = getEffectiveCellValue(contextMenu.rowIndex, i, row[i] ?? null);
    });
    await navigator.clipboard.writeText(JSON.stringify(obj));
    closeContextMenu();
  }, [contextMenu, result, getEffectiveCellValue, closeContextMenu, getRowByLogicalId]);

  // 6.2: Duplicate Row (insert with same values, PK nulled)
  const duplicateContextRow = useCallback(() => {
    if (!contextMenu || !result) return;
    const sourceRow = getRowByLogicalId(contextMenu.rowIndex);
    if (!sourceRow) { closeContextMenu(); return; }
    const insertId = -(Date.now());
    const defaults = result.columns.map((col, i) => {
      if (col.isPrimaryKey) return null;
      return getEffectiveCellValue(contextMenu.rowIndex, i, sourceRow[i] ?? null);
    });
    const columnNames = result.columns.map(c => c.name);
    useChangeStore.getState().recordRowInsert(insertId, defaults, columnNames, page);
    closeContextMenu();
  }, [contextMenu, result, getEffectiveCellValue, closeContextMenu, page, getRowByLogicalId]);

  // 6.3: Delete Row(s) — multi-select aware
  const deleteContextRows = useCallback(() => {
    if (!contextMenu || !result) return;
    const rowsToDelete = selectedRows.has(contextMenu.rowIndex)
      ? Array.from(selectedRows).sort((a, b) => a - b)
      : [contextMenu.rowIndex];
    const store = useChangeStore.getState();
    for (const idx of rowsToDelete) {
      const row = getRowByLogicalId(idx);
      if (row) store.recordRowDelete(idx, row);
    }
    closeContextMenu();
  }, [contextMenu, result, selectedRows, closeContextMenu, getRowByLogicalId]);

  // 6.4: Set cell to NULL
  const setContextCellNull = useCallback(() => {
    if (!contextMenu || !result) return;
    const col = result.columns[contextMenu.colIndex];
    if (!col) { closeContextMenu(); return; }
    const oldValue = getEffectiveCellValue(contextMenu.rowIndex, contextMenu.colIndex, contextMenu.cellValue);
    if (oldValue === null) { closeContextMenu(); return; }
    const originalRowSnapshot = getRowByLogicalId(contextMenu.rowIndex) ?? [];
    recordCellChange({
      rowIndex: contextMenu.rowIndex,
      columnIndex: contextMenu.colIndex,
      columnName: col.name,
      oldValue,
      newValue: null,
    }, originalRowSnapshot);
    closeContextMenu();
  }, [contextMenu, result, getEffectiveCellValue, recordCellChange, closeContextMenu]);

  // 6.5: Edit Value — open cell editor
  const editContextCell = useCallback(() => {
    if (!contextMenu || !tableName) return;
    setEditingCell({ rowIdx: contextMenu.rowIndex, colIdx: contextMenu.colIndex });
    closeContextMenu();
  }, [contextMenu, tableName, closeContextMenu]);

  const resetSelection = useCallback(() => {
    setSelectedRows(new Set());
    setLastSelectedRow(null);
    setEditingCell(null);
  }, []);

  const handleFkNavigate = useCallback((refTable: string, refColumn: string, refSchema: string | undefined, value: string) => {
    const escaped = value.replace(/'/g, "''");
    const qualifiedTable = refSchema ? `"${refSchema}"."${refTable}"` : `"${refTable}"`;
    const sql = `SELECT * FROM ${qualifiedTable} WHERE "${refColumn}" = '${escaped}'`;
    const tabId = useEditorStore.getState().addTab(refTable);
    useEditorStore.getState().updateTabContent(tabId, sql);
  }, []);

  const copySelectedRowsTsv = useCallback(async () => {
    if (!result || selectedRows.size === 0) return;
    const header = result.columns.map(c => c.name).join('\t');
    const sorted = Array.from(selectedRows).sort((a, b) => a - b);
    const lines = sorted.map(idx =>
      result.columns.map((_, ci) => {
        const row = getRowByLogicalId(idx);
        return getEffectiveCellValue(idx, ci, row?.[ci] ?? null) ?? '';
      }).join('\t')
    );
    await navigator.clipboard.writeText([header, ...lines].join('\n'));
  }, [result, selectedRows, getEffectiveCellValue, getRowByLogicalId]);

  return {
    selectedRows,
    lastSelectedRow,
    handleRowSelect,
    editingCell,
    handleCellDoubleClick,
    handleCellCommit,
    handleCellCancel,
    contextMenu,
    handleCellContextMenu,
    closeContextMenu,
    copySelectedRowsSql,
    copyContextRowTsv,
    copyContextCell,
    copyContextRowJson,
    duplicateContextRow,
    deleteContextRows,
    setContextCellNull,
    editContextCell,
    resetSelection,
    querySearchTerm,
    queryFilteredIndices,
    handleQueryQuickSearch,
    handleQueryQuickSearchClear,
    quickSearchTerm,
    handleQuickSearch,
    handleQuickSearchClear,
    handleFkNavigate,
    showExport,
    setShowExport,
    copySelectedRowsTsv,
  };
}
