import { useState, useCallback } from 'react';
import { useChangeStore } from '../../stores/changeStore';
import { saveChanges } from '../../ipc/commands';
import { extractErrorMessage } from '../../ipc/error';
import type { SavePayload, RowChangePayload, CellChangePayload } from '../../ipc/commands';
import type { QueryResult } from '../../types/query';
import type { SortingState } from '@tanstack/react-table';

interface UseTableSaveProps {
  tableName: string | undefined;
  schema: string | null | undefined;
  sessionId: string | undefined;
  result: QueryResult | null;
  fetchTableData: (
    sid: string, tbl: string, sch: string | null,
    pg: number, ps: number, where: string | null, sort: SortingState,
  ) => Promise<void>;
  page: number;
  pageSize: number;
  activeWhereClause: string | undefined;
  sorting: SortingState;
}

export function useTableSave({
  tableName, schema, sessionId, result,
  fetchTableData, page, pageSize, activeWhereClause, sorting,
}: UseTableSaveProps) {
  const changesSnapshot = useChangeStore((s) => s._changes);
  const clearChanges = useChangeStore((s) => s.clear);
  const recordCellChange = useChangeStore((s) => s.recordCellChange);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dismissSaveError = useCallback(() => setSaveError(null), []);

  const handleSave = useCallback(async () => {
    if (!tableName || !sessionId || !result) return;
    const changesEntries = Object.entries(changesSnapshot);
    if (changesEntries.length === 0) return;

    const columns = result.columns.map(c => c.name);
    // The backend quotes by declared type, not by guessing at the value —
    // without this a varchar "007" would be written as the number 7.
    const columnTypes = result.columns.map(c => c.typeName || null);
    const detectedPks = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);
    // Fallback to all columns when backend doesn't populate isPrimaryKey
    const primaryKeys = detectedPks.length > 0 ? detectedPks : columns;

    const rowChanges: RowChangePayload[] = [];
    for (const [rowIdxStr, change] of changesEntries) {
      const rowIdx = Number(rowIdxStr);
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
      columnTypes,
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

  return { isSaving, saveError, dismissSaveError, handleSave, changesSnapshot, recordCellChange };
}
