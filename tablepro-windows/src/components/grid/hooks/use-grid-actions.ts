import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFilterStore } from '../../../stores/filterStore';
import { useEditorStore } from '../../../stores/editorStore';
import { useInspectorStore } from '../../../stores/inspectorStore';
import type { QueryResult } from '../../../types/query';
import FilterWorker from '../../../workers/filter-worker?worker';
import { type GridSelection, type SelectionRect, EMPTY_SELECTION, getNormalizedRect, getSelectedRowIds } from '../grid-selection';
import { useGridNavigation, type UseGridNavigationReturn } from './use-grid-navigation';
import { useGridClipboard, type UseGridClipboardReturn } from './use-grid-clipboard';

interface UseGridActionsProps {
  tabId?: string;
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  result: QueryResult | null;
  isTableMode: boolean;
  page?: number;
  rowIds?: number[];
  getEffectiveCellValue: (rowIdx: number, colIdx: number, fallback: string | null) => string | null;
  onRowSelectProp?: (rowIndex: number | null) => void;
}

export interface UseGridActionsReturn extends UseGridNavigationReturn, UseGridClipboardReturn {
  selectedRows: Set<number>;
  selection: GridSelection;
  selectionRect: SelectionRect | null;
  selectCell: (rowId: number, col: number) => void;
  selectRow: (rowId: number, colCount: number) => void;
  clearSelection: () => void;
  handleRowSelect: (rowIdx: number, mode: 'single' | 'range' | 'toggle') => void;
  editingCell: { rowIdx: number; colIdx: number } | null;
  resetSelection: () => void;
  querySearchTerm: string;
  queryFilteredIndices: number[] | null;
  handleQueryQuickSearch: (term: string, whereClause: string) => void;
  handleQueryQuickSearchClear: () => void;
  quickSearchTerm: string;
  handleQuickSearch: (term: string, whereClause: string) => void;
  handleQuickSearchClear: () => void;
  handleFkNavigate: (refTable: string, refColumn: string, refSchema: string | undefined, value: string) => void;
  showExport: boolean;
  setShowExport: (v: boolean) => void;
}

export function useGridActions({
  tabId, tableName, schema, sessionId, result, isTableMode, page, rowIds,
  getEffectiveCellValue, onRowSelectProp,
}: UseGridActionsProps): UseGridActionsReturn {
  const [selection, setSelection] = useState<GridSelection>(EMPTY_SELECTION);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [showExport, setShowExport] = useState(false);

  const setQuickSearch = useFilterStore((s) => s.setQuickSearch);
  const clearQuickSearch = useFilterStore((s) => s.clearQuickSearch);
  const quickSearchTerm = useFilterStore((s) => tabId ? (s.byTab[tabId]?.quickSearchTerm ?? '') : '');

  const [querySearchTerm, setQuerySearchTerm] = useState('');
  const [queryFilteredIndices, setQueryFilteredIndices] = useState<number[] | null>(null);
  const filterWorkerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setInspectorData = useInspectorStore((s) => s.setInspectorData);

  const getDisplayIdx = useCallback((logicalId: number): number => {
    if (!rowIds) return logicalId;
    const idx = rowIds.indexOf(logicalId);
    return idx >= 0 ? idx : logicalId;
  }, [rowIds]);

  const getRowByLogicalId = useCallback((logicalId: number): (string | null)[] | undefined => {
    return result?.rows[getDisplayIdx(logicalId)];
  }, [result, getDisplayIdx]);

  const getLogicalRowId = useCallback((displayIdx: number): number => {
    if (!rowIds) return displayIdx;
    return rowIds[displayIdx] ?? displayIdx;
  }, [rowIds]);

  const visibleColCount = result?.columns.length ?? 0;
  const displayRowCount = result?.rows.length ?? 0;

  const selectedRows = useMemo(
    () => getSelectedRowIds(selection, getDisplayIdx, getLogicalRowId, displayRowCount, visibleColCount),
    [selection, getDisplayIdx, getLogicalRowId, displayRowCount, visibleColCount],
  );
  const selectionRect = useMemo(
    () => getNormalizedRect(selection, getDisplayIdx, displayRowCount, visibleColCount),
    [selection, getDisplayIdx, displayRowCount, visibleColCount],
  );

  useEffect(() => {
    const worker = new FilterWorker();
    filterWorkerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'filter-result') setQueryFilteredIndices(e.data.indices);
    };
    return () => { worker.terminate(); filterWorkerRef.current = null; };
  }, []);

  useEffect(() => {
    if (filterWorkerRef.current && result && !isTableMode)
      filterWorkerRef.current.postMessage({ type: 'set-rows', rows: result.rows });
    setQueryFilteredIndices(null);
    setQuerySearchTerm('');
  }, [result, isTableMode]);

  const prevTableRef = useRef(tableName);
  useEffect(() => {
    if (prevTableRef.current !== tableName) {
      setSelection(EMPTY_SELECTION);
      setEditingCell(null);
    }
    prevTableRef.current = tableName;
  }, [tableName]);

  const handleQueryQuickSearch = useCallback((term: string, _whereClause: string) => {
    setQuerySearchTerm(term);
    if (!term.trim()) { setQueryFilteredIndices(null); if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); return; }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      filterWorkerRef.current?.postMessage({ type: 'filter', term });
    }, 200);
  }, []);

  const handleQueryQuickSearchClear = useCallback(() => {
    setQuerySearchTerm(''); setQueryFilteredIndices(null);
  }, []);

  const handleQuickSearch = useCallback((term: string, whereClause: string) => {
    if (tabId) setQuickSearch(tabId, term, whereClause);
  }, [tabId, setQuickSearch]);

  const handleQuickSearchClear = useCallback(() => {
    if (tabId) clearQuickSearch(tabId);
  }, [tabId, clearQuickSearch]);

  const selectCell = useCallback((rowId: number, col: number) => {
    const coord = { row: rowId, col };
    setSelection({ active: coord, anchor: coord, extent: coord, mode: 'cell' });
    if (result) setInspectorData(result.columns, getRowByLogicalId(rowId) ?? null);
  }, [result, setInspectorData, getRowByLogicalId]);

  const selectRow = useCallback((rowId: number, colCount: number) => {
    const anchor = { row: rowId, col: 0 };
    const extent = { row: rowId, col: colCount - 1 };
    setSelection({ active: anchor, anchor, extent, mode: 'row' });
    if (result) setInspectorData(result.columns, getRowByLogicalId(rowId) ?? null);
  }, [result, setInspectorData, getRowByLogicalId]);

  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);

  const handleRowSelect = useCallback((rowIdx: number, mode: 'single' | 'range' | 'toggle') => {
    if (mode === 'single' || mode === 'toggle') {
      selectRow(rowIdx, visibleColCount);
      onRowSelectProp?.(rowIdx);
    } else if (mode === 'range') {
      setSelection(prev => {
        const anchor = prev.anchor ?? { row: rowIdx, col: 0 };
        return { active: { row: rowIdx, col: 0 }, anchor, extent: { row: rowIdx, col: visibleColCount - 1 }, mode: 'row' };
      });
      onRowSelectProp?.(rowIdx);
      if (result) setInspectorData(result.columns, getRowByLogicalId(rowIdx) ?? null);
    }
  }, [selectRow, visibleColCount, onRowSelectProp, result, setInspectorData, getRowByLogicalId]);

  const resetSelection = useCallback(() => { setSelection(EMPTY_SELECTION); setEditingCell(null); }, []);

  const handleFkNavigate = useCallback((refTable: string, refColumn: string, refSchema: string | undefined, value: string) => {
    const escaped = value.replace(/'/g, "''");
    const qualifiedTable = refSchema ? `"${refSchema}"."${refTable}"` : `"${refTable}"`;
    const sql = `SELECT * FROM ${qualifiedTable} WHERE "${refColumn}" = '${escaped}'`;
    const newTabId = useEditorStore.getState().addTab(refTable);
    useEditorStore.getState().updateTabContent(newTabId, sql);
  }, []);

  const navigation = useGridNavigation({
    selection, setSelection, getDisplayIdx, getLogicalRowId,
    displayRowCount, visibleColCount, tableName, setEditingCell,
  });
  const clipboard = useGridClipboard({
    result, tableName, schema, sessionId, page,
    selection, selectionRect, selectedRows,
    setSelection, setEditingCell,
    getDisplayIdx, getLogicalRowId, getRowByLogicalId, getEffectiveCellValue,
    displayRowCount,
  });

  return {
    ...navigation, ...clipboard,
    selectedRows, selection, selectionRect,
    selectCell, selectRow, clearSelection, handleRowSelect,
    editingCell, resetSelection,
    querySearchTerm, queryFilteredIndices,
    handleQueryQuickSearch, handleQueryQuickSearchClear,
    quickSearchTerm, handleQuickSearch, handleQuickSearchClear,
    handleFkNavigate, showExport, setShowExport,
  };
}
