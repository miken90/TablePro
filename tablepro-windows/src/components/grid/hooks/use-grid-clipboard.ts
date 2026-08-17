import React, { useState, useCallback } from 'react';
import { useChangeStore } from '../../../stores/changeStore';
import { generateRowSql, type RowSqlFormat } from '../../../ipc/commands';
import type { QueryResult } from '../../../types/query';
import { type GridSelection, type SelectionRect, getNormalizedRect, isCellInRect } from '../grid-selection';

export type ContextMenuState = { x: number; y: number; rowIndex: number; colIndex: number; cellValue: string | null; row: (string | null)[] };

export interface UseGridClipboardReturn {
  contextMenu: ContextMenuState | null;
  handleCellContextMenu: (e: React.MouseEvent<HTMLDivElement>, r: number, c: number, v: string | null, row: (string | null)[]) => void;
  closeContextMenu: () => void;
  handleCellDoubleClick: (rowIdx: number, colIdx: number) => void;
  handleCellCommit: (rowIdx: number, colIdx: number, newValue: string | null) => void;
  handleCellCancel: () => void;
  copySelectedRowsSql: (fmt: RowSqlFormat) => Promise<void>;
  copyContextRowTsv: () => Promise<void>;
  copyContextCell: () => Promise<void>;
  copyContextRowJson: () => Promise<void>;
  duplicateContextRow: () => void; deleteContextRows: () => void;
  setContextCellNull: () => void; editContextCell: () => void;
  copySelection: () => Promise<void>; copySelectedRowsTsv: () => Promise<void>;
  pasteIntoSelectedRows: () => Promise<void>;
}

export function useGridClipboard(p: {
  result: QueryResult | null; tableName?: string; schema?: string | null;
  sessionId?: string; page?: number; selection: GridSelection;
  selectionRect: SelectionRect | null; selectedRows: Set<number>;
  setSelection: React.Dispatch<React.SetStateAction<GridSelection>>;
  setEditingCell: React.Dispatch<React.SetStateAction<{ rowIdx: number; colIdx: number; trigger?: 'click' | 'keyboard' } | null>>;
  getDisplayIdx: (id: number) => number; getLogicalRowId: (idx: number) => number;
  getRowByLogicalId: (id: number) => (string | null)[] | undefined;
  getEffectiveCellValue: (r: number, c: number, fb: string | null) => string | null;
  displayRowCount: number;
}): UseGridClipboardReturn {
  const { result, tableName, schema, sessionId, page, selection, selectionRect, selectedRows,
    setSelection, setEditingCell, getDisplayIdx, getLogicalRowId, getRowByLogicalId,
    getEffectiveCellValue, displayRowCount } = p;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const recordCellChange = useChangeStore((s) => s.recordCellChange);
  const changesSnapshot = useChangeStore((s) => s._changes);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const handleCellDoubleClick = useCallback((rowIdx: number, colIdx: number) => {
    if (!tableName) { navigator.clipboard.writeText(getRowByLogicalId(rowIdx)?.[colIdx] ?? '').catch(() => {}); return; }
    setEditingCell({ rowIdx, colIdx, trigger: 'click' });
  }, [tableName, getRowByLogicalId, setEditingCell]);
  const handleCellCommit = useCallback((rowIdx: number, colIdx: number, newValue: string | null) => {
    if (!result) return;
    const col = result.columns[colIdx];
    const oldValue = getRowByLogicalId(rowIdx)?.[colIdx] ?? null;
    if (oldValue === newValue) { setEditingCell(null); return; }
    recordCellChange({ rowIndex: rowIdx, columnIndex: colIdx, columnName: col.name, oldValue, newValue }, getRowByLogicalId(rowIdx) ?? []);
    setEditingCell(null);
  }, [result, recordCellChange, getRowByLogicalId, setEditingCell]);

  const handleCellCancel = useCallback(() => setEditingCell(null), [setEditingCell]);

  const handleCellContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, rowIdx: number, colIdx: number, cellValue: string | null, row: (string | null)[]) => {
      event.preventDefault();
      if (!selectionRect || !isCellInRect(selectionRect, getDisplayIdx(rowIdx), colIdx)) {
        const coord = { row: rowIdx, col: colIdx };
        setSelection({ active: coord, anchor: coord, extent: coord, mode: 'cell' });
      }
      setContextMenu({ x: event.clientX, y: event.clientY, rowIndex: rowIdx, colIndex: colIdx, cellValue, row });
    }, [selectionRect, getDisplayIdx, setSelection],
  );

  const copySelectedRowsSql = useCallback(async (outputFormat: RowSqlFormat) => {
    if (!sessionId || !tableName || !result || !contextMenu) return;
    const rowIndexes = selectedRows.has(contextMenu.rowIndex)
      ? Array.from(selectedRows).sort((a, b) => a - b) : [contextMenu.rowIndex];

    const sqlStatements: string[] = [];
    const pks = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);

    if (outputFormat !== 'UPDATE') {
      // Batch everything in a single call (Legacy behavior for non-UPDATE)
      const rows = rowIndexes.map((idx) => {
        const src = getRowByLogicalId(idx) ?? [];
        return result.columns.map((_, ci) => getEffectiveCellValue(idx, ci, src[ci] ?? null));
      });
      const sql = await generateRowSql(sessionId, {
        table: tableName,
        schema: schema ?? null,
        columns: result.columns.map(c => c.name),
        primaryKeys: pks,
        rows,
        outputFormat,
      });
      if (sql) sqlStatements.push(sql);
    } else {
      // Group UPDATE rows by unique set of columns to minimize IPC calls
      const batches = new Map<string, { cols: string[]; rowValuesList: (string | null)[][] }>();

      for (const idx of rowIndexes) {
        const src = getRowByLogicalId(idx) ?? [];
        const change = changesSnapshot[idx];

        let colsToPass = result.columns.map(c => c.name);
        if (change?.type === 'update' && change.cellChanges.length > 0) {
          const modifiedCols = change.cellChanges.map(cc => cc.columnName);
          colsToPass = Array.from(new Set([...pks, ...modifiedCols]));
        }

        const rowValues = colsToPass.map((colName) => {
          const ci = result.columns.findIndex(c => c.name === colName);
          return getEffectiveCellValue(idx, ci, src[ci] ?? null);
        });

        const key = colsToPass.join(',');
        if (!batches.has(key)) {
          batches.set(key, { cols: colsToPass, rowValuesList: [] });
        }
        batches.get(key)!.rowValuesList.push(rowValues);
      }

      // Execute one IPC call per unique column set
      for (const { cols, rowValuesList } of batches.values()) {
        const sql = await generateRowSql(sessionId, {
          table: tableName,
          schema: schema ?? null,
          columns: cols,
          primaryKeys: pks,
          rows: rowValuesList,
          outputFormat,
        });
        if (sql) sqlStatements.push(sql);
      }
    }

    if (sqlStatements.length > 0) {
      await navigator.clipboard.writeText(sqlStatements.join('\n'));
    }
    closeContextMenu();
  }, [sessionId, tableName, result, contextMenu, selectedRows, schema, closeContextMenu, getEffectiveCellValue, getRowByLogicalId, changesSnapshot]);

  const copyContextRowTsv = useCallback(async () => {
    if (!contextMenu || !result) return;
    const tsv = result.columns.map((_, ci) => getEffectiveCellValue(contextMenu.rowIndex, ci, contextMenu.row[ci] ?? null) ?? '').join('\t');
    await navigator.clipboard.writeText(tsv);
    closeContextMenu();
  }, [contextMenu, result, closeContextMenu, getEffectiveCellValue]);

  const copyContextCell = useCallback(async () => {
    if (!contextMenu) return;
    await navigator.clipboard.writeText(contextMenu.cellValue ?? '');
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const copyContextRowJson = useCallback(async () => {
    if (!contextMenu || !result) return;
    const row = getRowByLogicalId(contextMenu.rowIndex);
    if (!row) { closeContextMenu(); return; }
    const obj: Record<string, string | null> = {};
    result.columns.forEach((col, i) => { obj[col.name] = getEffectiveCellValue(contextMenu.rowIndex, i, row[i] ?? null); });
    await navigator.clipboard.writeText(JSON.stringify(obj));
    closeContextMenu();
  }, [contextMenu, result, getEffectiveCellValue, closeContextMenu, getRowByLogicalId]);

  const duplicateContextRow = useCallback(() => {
    if (!contextMenu || !result) return;
    const sourceRow = getRowByLogicalId(contextMenu.rowIndex);
    if (!sourceRow) { closeContextMenu(); return; }
    const defaults = result.columns.map((col, i) => col.isPrimaryKey ? null : getEffectiveCellValue(contextMenu.rowIndex, i, sourceRow[i] ?? null));
    useChangeStore.getState().recordRowInsert(-(Date.now()), defaults, result.columns.map(c => c.name), page);
    closeContextMenu();
  }, [contextMenu, result, getEffectiveCellValue, closeContextMenu, page, getRowByLogicalId]);

  const deleteContextRows = useCallback(() => {
    if (!result) return;
    let rows: number[];
    if (contextMenu) {
      rows = selectedRows.has(contextMenu.rowIndex) ? Array.from(selectedRows).sort((a, b) => a - b) : [contextMenu.rowIndex];
    } else {
      // Called from keyboard shortcut — delete all selected rows
      if (selectedRows.size === 0) return;
      rows = Array.from(selectedRows).sort((a, b) => a - b);
    }
    const store = useChangeStore.getState();
    for (const idx of rows) { const r = getRowByLogicalId(idx); if (r) store.recordRowDelete(idx, r); }
    closeContextMenu();
  }, [contextMenu, result, selectedRows, closeContextMenu, getRowByLogicalId]);

  const setContextCellNull = useCallback(() => {
    if (!contextMenu || !result) return;
    const col = result.columns[contextMenu.colIndex];
    if (!col) { closeContextMenu(); return; }
    const oldValue = getEffectiveCellValue(contextMenu.rowIndex, contextMenu.colIndex, contextMenu.cellValue);
    if (oldValue === null) { closeContextMenu(); return; }
    recordCellChange({ rowIndex: contextMenu.rowIndex, columnIndex: contextMenu.colIndex, columnName: col.name, oldValue, newValue: null },
      getRowByLogicalId(contextMenu.rowIndex) ?? []);
    closeContextMenu();
  }, [contextMenu, result, getEffectiveCellValue, recordCellChange, closeContextMenu, getRowByLogicalId]);
  const editContextCell = useCallback(() => {
    if (!contextMenu || !tableName) return;
    setEditingCell({ rowIdx: contextMenu.rowIndex, colIdx: contextMenu.colIndex, trigger: 'click' });
    closeContextMenu();
  }, [contextMenu, tableName, closeContextMenu, setEditingCell]);

  const copySelection = useCallback(async () => {
    if (!result || !selection.mode) return;
    const cols = result.columns;
    const rect = getNormalizedRect(selection, getDisplayIdx, displayRowCount, cols.length);
    if (!rect) return;
    if (selection.mode === 'cell' && selection.active) {
      const row = getRowByLogicalId(selection.active.row);
      const ci = selection.active.col;
      await navigator.clipboard.writeText(getEffectiveCellValue(selection.active.row, ci, row?.[ci] ?? null) ?? '');
      return;
    }
    const lines: string[] = [];
    if (selection.mode === 'row' || selection.mode === 'column')
      lines.push(cols.slice(rect.left, rect.right + 1).map(c => c.name).join('\t'));
    for (let dr = rect.top; dr <= rect.bottom; dr++) {
      const rid = getLogicalRowId(dr), row = getRowByLogicalId(rid) ?? [], vals: string[] = [];
      for (let c = rect.left; c <= rect.right; c++) vals.push(getEffectiveCellValue(rid, c, row[c] ?? null) ?? '');
      lines.push(vals.join('\t'));
    }
    await navigator.clipboard.writeText(lines.join('\n'));
  }, [result, selection, getDisplayIdx, getLogicalRowId, displayRowCount, getRowByLogicalId, getEffectiveCellValue]);

  const copySelectedRowsTsv = useCallback(async () => {
    if (!result || selectedRows.size === 0) return;
    const header = result.columns.map(c => c.name).join('\t');
    const sorted = Array.from(selectedRows).sort((a, b) => a - b);
    const lines = sorted.map(idx => result.columns.map((_, ci) => {
      const row = getRowByLogicalId(idx); return getEffectiveCellValue(idx, ci, row?.[ci] ?? null) ?? '';
    }).join('\t'));
    await navigator.clipboard.writeText([header, ...lines].join('\n'));
  }, [result, selectedRows, getEffectiveCellValue, getRowByLogicalId]);

  const pasteIntoSelectedRows = useCallback(async () => {
    if (!result || !tableName || selectedRows.size === 0) return;
    const text = await navigator.clipboard.readText();
    if (!text.trim()) return;
    const lines = text.split('\n').filter(l => l.length > 0);
    const sortedRows = Array.from(selectedRows).sort((a, b) => a - b);
    const cols = result.columns;
    for (let li = 0; li < lines.length && li < sortedRows.length; li++) {
      const rowIdx = sortedRows[li], values = lines[li].split('\t'), origRow = getRowByLogicalId(rowIdx) ?? [];
      for (let ci = 0; ci < Math.min(values.length, cols.length); ci++) {
        if (cols[ci].isPrimaryKey) continue;
        const nv = values[ci] === '' ? null : values[ci];
        const ov = getEffectiveCellValue(rowIdx, ci, origRow[ci] ?? null);
        if (ov === nv) continue;
        recordCellChange({ rowIndex: rowIdx, columnIndex: ci, columnName: cols[ci].name, oldValue: ov, newValue: nv }, origRow);
      }
    }
  }, [result, tableName, selectedRows, getRowByLogicalId, getEffectiveCellValue, recordCellChange]);

  return {
    contextMenu, handleCellContextMenu, closeContextMenu,
    handleCellDoubleClick, handleCellCommit, handleCellCancel,
    copySelectedRowsSql, copyContextRowTsv, copyContextCell, copyContextRowJson,
    duplicateContextRow, deleteContextRows, setContextCellNull, editContextCell,
    copySelection, copySelectedRowsTsv, pasteIntoSelectedRows,
  };
}
