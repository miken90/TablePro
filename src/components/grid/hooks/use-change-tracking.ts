import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useChangeStore } from '../../../stores/changeStore';
import type { CellChange, RowChange } from '../../../stores/changeStore';
import { useQueryStore, checkSafeMode } from '../../../stores/queryStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { saveChanges, previewStatements, type SavePayload, type RowChangePayload, type CellChangePayload } from '../../../ipc/commands';
import { extractErrorMessage } from '../../../ipc/error';
import type { QueryResult } from '../../../types/query';

type ChangesSnapshot = Record<number, RowChange>;

/** Where the staged edits were made. Row ids are page-local. */
export interface StagedView {
  page: number;
  sorting: SortingState;
}

/** Two sortings address the same rows when the same columns run the same way. */
function sameSorting(a: SortingState, b: SortingState): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.id === b[i].id && s.desc === b[i].desc);
}

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
  /** The exact payload the write sends — the preview is built from this too. */
  buildSavePayload: () => SavePayload | null;
  /** Whether `buildSavePayload` would return a payload, without building one. */
  canSave: boolean;
  /** The page and sort the staged edits were made on, or null when nothing is staged. */
  stagedView: StagedView | null;
  /** False while the grid shows a different page or sort than the edits were staged on. */
  stagedViewMatches: boolean;
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
  const safeModeLevel = useSettingsStore((s) => s.settings.safeModeLevel);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  const hasChanges = useMemo(() => Object.keys(changesSnapshot).length > 0, [changesSnapshot]);
  const changeCount = useMemo(() => Object.keys(changesSnapshot).length, [changesSnapshot]);

  // Staged row ids are indices into the page that was on screen when the edit
  // was made, so a page or sort change silently re-points them at other rows.
  // Recording where they were staged is what lets the strip refuse Execute
  // instead of writing to the wrong rows.
  const [stagedView, setStagedView] = useState<StagedView | null>(null);
  const pageRef = useRef(page);
  const sortingRef = useRef(sorting);
  pageRef.current = page;
  sortingRef.current = sorting;
  useEffect(() => {
    if (!hasChanges) {
      setStagedView(null);
      return;
    }
    setStagedView((prev) => prev ?? { page: pageRef.current, sorting: sortingRef.current });
  }, [hasChanges]);

  const stagedViewMatches = !stagedView
    || (stagedView.page === page && sameSorting(stagedView.sorting, sorting));

  const getEffectiveCellValue = useCallback((rowIdx: number, colIdx: number, fallback: string | null) => {
    const rowChange = changesSnapshot[rowIdx];
    if (!rowChange) return fallback;
    const override = rowChange.cellChanges.find((cc) => cc.columnIndex === colIdx);
    return override ? override.newValue : fallback;
  }, [changesSnapshot]);

  /**
   * The one payload builder. Preview and execute both call it, so what the
   * user is shown and what is written are generated from the same input by
   * the same backend code.
   */
  const buildSavePayload = useCallback((): SavePayload | null => {
    if (!tableName || !result) return null;
    const changesEntries = Object.entries(changesSnapshot);
    if (changesEntries.length === 0) return null;

    const columns = result.columns.map(c => c.name);
    // The backend quotes by declared type, not by guessing at the value —
    // without this a varchar "007" would be written as the number 7.
    const columnTypes = result.columns.map(c => c.typeName || null);
    const detectedPks = result.columns.filter(c => c.isPrimaryKey).map(c => c.name);
    const primaryKeys = detectedPks.length > 0 ? detectedPks : columns;

    const rowChanges: RowChangePayload[] = [];
    for (const [rowIdxStr, change] of changesEntries) {
      const rowIdx = Number(rowIdxStr);
      // For updates/deletes, use stable snapshot captured on first edit.
      // For inserted rows (negative id), build from cellChanges.
      const originalRow = rowIdx >= 0
        ? (change.originalRow.length > 0 ? change.originalRow : (result.rows[rowIdx] ?? []))
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

    return {
      table: tableName,
      schema: schema ?? null,
      columns,
      columnTypes,
      primaryKeys,
      changes: rowChanges,
    };
  }, [tableName, schema, result, changesSnapshot]);

  // Exactly `buildSavePayload`'s three null conditions, answered without
  // materializing the payload — the strip asks this on every render.
  const canSave = !!tableName && !!result && hasChanges;

  const handleSave = useCallback(async () => {
    if (!sessionId) return;
    const payload = buildSavePayload();
    if (!payload) return;

    const commit = async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await saveChanges(sessionId, payload);
        clearChanges();
        fetchTableData(sessionId, tableName!, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
      } catch (err) {
        setSaveError(extractErrorMessage(err));
      } finally {
        setIsSaving(false);
      }
    };

    // Safe Mode lives in `queryStore.execute`, which the grid never calls, so
    // a Read-Only session could still write through this path. The check runs
    // on the statements the backend will actually execute, and a refusal
    // leaves the staged edits alone so nothing is lost.
    setIsSaving(true);
    setSaveError(null);
    let sql: string;
    try {
      const plan = await previewStatements(sessionId, payload);
      sql = plan.statements.join(';\n');
    } catch (err) {
      setSaveError(extractErrorMessage(err));
      setIsSaving(false);
      return;
    }
    setIsSaving(false);

    const check = checkSafeMode(sql, safeModeLevel);
    if (check.blocked) {
      setSaveError('Read-only mode: write queries are blocked (Safe Mode Level 5).');
      return;
    }
    if (check.needsConfirm) {
      useQueryStore.setState({
        pendingSafeCheck: {
          sessionId,
          sql,
          level: safeModeLevel,
          dangerType: check.dangerType,
          onConfirm: commit,
        },
      });
      return;
    }

    await commit();
  }, [
    sessionId, buildSavePayload, safeModeLevel, clearChanges, fetchTableData,
    tableName, schema, page, pageSize, activeWhereClause, sorting,
  ]);

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
    buildSavePayload,
    canSave,
    stagedView,
    stagedViewMatches,
    recordCellChange,
    getEffectiveCellValue,
    changeMap,
    cellOverrides,
  };
}
