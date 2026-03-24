import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useChangeStore } from '../../../stores/changeStore';
import type { CellChange, RowChange } from '../../../stores/changeStore';
import { saveChanges, type SavePayload, type RowChangePayload, type CellChangePayload } from '../../../ipc/commands';
import { extractErrorMessage } from '../../../ipc/error';
import type { QueryResult } from '../../../types/query';

type ChangesSnapshot = Record<number, RowChange>;

interface UseChangeTrackingProps {
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  result: QueryResult | null;
  fetchTableData: (
    sid: string, tbl: string, sch: string | null,
    pg: number, ps: number, where: string | null, sort: SortingState,
  ) => Promise<void>;
  page: number;
  pageSize: number;
  activeWhereClause?: string;
  sorting: SortingState;
}

export interface UseChangeTrackingReturn {
  changesSnapshot: ChangesSnapshot;
  hasChanges: boolean;
  changeCount: number;
  isSaving: boolean;
  saveError: string | null;
  dismissSaveError: () => void;
  handleSave: () => Promise<void>;
  recordCellChange: (change: CellChange) => void;
  getEffectiveCellValue: (rowIdx: number, colIdx: number, fallback: string | null) => string | null;
  changeMap: Map<number, 'modified' | 'inserted' | 'deleted'>;
  cellOverrides: Map<string, string | null>;
}

export function useChangeTracking({
  tableName, schema, sessionId, result,
  fetchTableData, page, pageSize, activeWhereClause, sorting,
}: UseChangeTrackingProps): UseChangeTrackingReturn {
  const changesSnapshot = useChangeStore((s) => s._changes);
  const clearChanges = useChangeStore((s) => s.clear);
  const recordCellChange = useChangeStore((s) => s.recordCellChange);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  const hasChanges = useMemo(() => Object.keys(changesSnapshot).length > 0, [changesSnapshot]);
  const changeCount = useMemo(() => Object.keys(changesSnapshot).length, [changesSnapshot]);

  const getEffectiveCellValue = useCallback((rowIdx: number, colIdx: number, fallback: string | null) => {
    const rowChange = changesSnapshot[rowIdx];
    if (!rowChange) return fallback;
    const override = rowChange.cellChanges.find((cc) => cc.columnIndex === colIdx);
    return override ? override.newValue : fallback;
  }, [changesSnapshot]);

  const handleSave = useCallback(async () => {
    if (!tableName || !sessionId || !result) return;
    const changesEntries = Object.entries(changesSnapshot);
    if (changesEntries.length === 0) return;

    const columns = result.columns.map(c => c.name);
    const detectedPks = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);
    const primaryKeys = detectedPks.length > 0 ? detectedPks : columns;

    const rowChanges: RowChangePayload[] = [];
    for (const [rowIdxStr, change] of changesEntries) {
      const rowIdx = Number(rowIdxStr);
      // For inserted rows (negative id), build row from cellChanges; no original row exists
      const originalRow = rowIdx >= 0
        ? (result.rows[rowIdx] ?? [])
        : columns.map((_, colIdx) => {
            const cc = change.cellChanges.find((c) => c.columnIndex === colIdx);
            return cc?.newValue ?? null;
          });
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
      fetchTableData(sessionId, tableName, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }, [tableName, schema, sessionId, result, changesSnapshot, clearChanges, fetchTableData, page, pageSize, activeWhereClause, sorting]);

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

  return {
    changesSnapshot,
    hasChanges,
    changeCount,
    isSaving,
    saveError,
    dismissSaveError,
    handleSave,
    recordCellChange,
    getEffectiveCellValue,
    changeMap,
    cellOverrides,
  };
}
