import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useSchemaStore } from '../../../stores/schemaStore';
import { useQueryLogStore } from '../../../stores/queryLogStore';
import { useTableDataStore, DEFAULT_TAB_DATA } from '../../../stores/table-data-store';
import {
  fetchApproximateCount as fetchApproxCount,
  fetchCountFiltered,
  fetchEnumValues,
  fetchRowsFiltered,
} from '../../../ipc/commands';
import { extractErrorMessage } from '../../../ipc/error';
import type { QueryResult } from '../../../types/query';

function buildOrderByClause(sorting: SortingState): string | null {
  if (sorting.length === 0) return null;
  return sorting.map(s => `"${s.id}" ${s.desc ? 'DESC' : 'ASC'}`).join(', ');
}

/**
 * Resolve the exact filtered row count, or `null` when it cannot be determined.
 *
 * The count query is issued separately from the row fetch, so it can fail or
 * time out while rows load fine. Returning `0` in that case makes the UI claim
 * an empty table while it is rendering rows, so an undeterminable count is
 * reported as unknown instead.
 */
export async function resolveTotalCount(
  fetchCount: () => Promise<number>,
): Promise<number | null> {
  try {
    const fetched = await fetchCount();
    return typeof fetched === 'number' && Number.isFinite(fetched) ? fetched : null;
  } catch {
    return null;
  }
}

interface UseTableDataProps {
  tabId?: string;
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  activeWhereClause?: string;
}

export interface UseTableDataReturn {
  tableResult: QueryResult | null;
  /** `null` when the count query failed — unknown, not zero. */
  totalCount: number | null;
  approximateCount: number | null;
  isFetching: boolean;
  fetchError: string | null;
  page: number;
  pageSize: number;
  sorting: SortingState;
  enumValuesByColumn: Record<string, string[]>;
  fkMap: Record<string, Record<string, import('../../../stores/schemaStore').FkRef>>;
  setPage: (value: React.SetStateAction<number>) => void;
  setPageSize: (value: React.SetStateAction<number>) => void;
  setSorting: (value: React.SetStateAction<SortingState>) => void;
  fetchTableData: (
    sid: string, tbl: string, sch: string | null,
    pg: number, ps: number, where: string | null, sort: SortingState,
  ) => Promise<void>;
  resetTableState: () => void;
}

export function useTableData({
  tabId, tableName, schema, sessionId, activeWhereClause,
}: UseTableDataProps): UseTableDataReturn {
  const activeTabId = tabId || 'default';
  const tabData = useTableDataStore((s) => s.tabs[activeTabId]) || DEFAULT_TAB_DATA;
  const {
    tableResult, totalCount, approximateCount, page, pageSize, sorting,
    enumValuesByColumn, fetchError,
  } = tabData;

  const [isFetching, setIsFetching] = useState(false);
  const fetchSeqRef = useRef(0);

  const isTableMode = !!tableName && !!sessionId;
  const fkMap = useSchemaStore((s) => s.fkMap);
  const fetchForeignKeysForTable = useSchemaStore((s) => s.fetchForeignKeysForTable);

  const setPage = useCallback((valOrFunc: React.SetStateAction<number>) => {
    const current = useTableDataStore.getState().getTabData(activeTabId).page;
    const next = typeof valOrFunc === 'function' ? valOrFunc(current) : valOrFunc;
    useTableDataStore.getState().setTabData(activeTabId, { page: next });
  }, [activeTabId]);

  const setPageSize = useCallback((valOrFunc: React.SetStateAction<number>) => {
    const current = useTableDataStore.getState().getTabData(activeTabId).pageSize;
    const next = typeof valOrFunc === 'function' ? valOrFunc(current) : valOrFunc;
    useTableDataStore.getState().setTabData(activeTabId, { pageSize: next });
  }, [activeTabId]);

  const setSorting = useCallback((valOrFunc: React.SetStateAction<SortingState>) => {
    const current = useTableDataStore.getState().getTabData(activeTabId).sorting;
    const next = typeof valOrFunc === 'function' ? (valOrFunc as (prev: SortingState) => SortingState)(current) : valOrFunc;
    useTableDataStore.getState().setTabData(activeTabId, { sorting: next });
  }, [activeTabId]);

  const setEnumValuesByColumn = useCallback((valOrFunc: React.SetStateAction<Record<string, string[]>>) => {
    const current = useTableDataStore.getState().getTabData(activeTabId).enumValuesByColumn;
    const next = typeof valOrFunc === 'function' ? valOrFunc(current) : valOrFunc;
    useTableDataStore.getState().setTabData(activeTabId, { enumValuesByColumn: next });
  }, [activeTabId]);

  const setTableResult = useCallback((val: QueryResult | null) => {
    useTableDataStore.getState().setTabData(activeTabId, { tableResult: val });
  }, [activeTabId]);

  const setTotalCount = useCallback((val: number | null) => {
    useTableDataStore.getState().setTabData(activeTabId, { totalCount: val });
  }, [activeTabId]);

  const setApproximateCount = useCallback((val: number | null) => {
    useTableDataStore.getState().setTabData(activeTabId, { approximateCount: val });
  }, [activeTabId]);

  const setFetchError = useCallback((val: string | null) => {
    useTableDataStore.getState().setTabData(activeTabId, { fetchError: val });
  }, [activeTabId]);

  // Reset/initialize tab state when tableName or schema changes for this tab ID
  useEffect(() => {
    if (!activeTabId || !tableName) return;
    const cached = useTableDataStore.getState().getTabData(activeTabId);
    if (cached.tableName !== tableName || cached.schema !== schema) {
      useTableDataStore.getState().setTabData(activeTabId, {
        tableName,
        schema: schema ?? null,
        tableResult: null,
        totalCount: 0,
        approximateCount: null,
        page: 1,
        pageSize: 100,
        sorting: [],
        enumValuesByColumn: {},
        fetchedKey: null,
        fetchError: null,
      });
    }
  }, [activeTabId, tableName, schema]);

  // Reset page when filter changes for this tab ID
  useEffect(() => {
    if (!activeTabId) return;
    const cached = useTableDataStore.getState().getTabData(activeTabId);
    const filterStr = activeWhereClause ?? null;
    if (cached.activeWhereClause !== filterStr) {
      useTableDataStore.getState().setTabData(activeTabId, {
        activeWhereClause: filterStr,
        page: 1,
        fetchedKey: null, // Clear key to trigger reload
      });
    }
  }, [activeTabId, activeWhereClause]);

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
      // The rows landed. If the count query fails or times out the count is
      // *unknown*, not zero — and blanking the approximate estimate would
      // throw away the only figure we still have.
      const count = await resolveTotalCount(
        () => fetchCountFiltered(sid, tbl, sch, where || null),
      );
      if (seq !== fetchSeqRef.current) return;
      setTableResult(rows);
      setTotalCount(count);
      // An exact count supersedes the estimate; an unknown one keeps it.
      if (count !== null) setApproximateCount(null);

      // Cache the key representing successful fetch parameters
      const currentKey = `${sid}:${sch}:${tbl}:${pg}:${ps}:${where ?? ''}:${JSON.stringify(sort)}`;
      useTableDataStore.getState().setTabData(activeTabId, { fetchedKey: currentKey });

      useQueryLogStore.getState().update(logId, { status: 'success', durationMs: Date.now() - startMs, rowCount: rows.rows.length });
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      const errorMsg = extractErrorMessage(err);
      setFetchError(errorMsg);
      setTableResult(null);
      setTotalCount(0);
      useQueryLogStore.getState().update(logId, { status: 'error', durationMs: Date.now() - startMs, error: errorMsg });
    } finally {
      if (seq === fetchSeqRef.current) setIsFetching(false);
    }
  }, [activeTabId, setTableResult, setTotalCount, setApproximateCount, setFetchError]);

  // Fetch table data when dependencies change, bypassing if cached
  useEffect(() => {
    if (!isTableMode) {
      setTableResult(null);
      setTotalCount(0);
      setApproximateCount(null);
      return;
    }

    const currentKey = `${sessionId}:${schema}:${tableName}:${page}:${pageSize}:${activeWhereClause ?? ''}:${JSON.stringify(sorting)}`;
    const cachedKey = useTableDataStore.getState().getTabData(activeTabId).fetchedKey;
    if (currentKey === cachedKey) {
      return; // Skip auto-reload
    }

    fetchTableData(sessionId!, tableName!, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
  }, [isTableMode, sessionId, tableName, schema, page, pageSize, activeWhereClause, sorting, fetchTableData, activeTabId, setTableResult, setTotalCount, setApproximateCount]);

  // Fetch FK info
  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId) return;
    fetchForeignKeysForTable(sessionId, tableName, schema ?? undefined);
  }, [isTableMode, sessionId, tableName, schema, fetchForeignKeysForTable]);

  // Fetch approximate count
  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId) return;
    let cancelled = false;
    fetchApproxCount(sessionId, tableName, schema ?? null)
      .then((count) => {
        if (!cancelled && Number.isFinite(count)) setApproximateCount(count);
      })
      .catch(() => {
        if (!cancelled) setApproximateCount(null);
      });
    return () => { cancelled = true; };
  }, [isTableMode, sessionId, tableName, schema, setApproximateCount]);

  // Fetch enum values
  useEffect(() => {
    if (!isTableMode || !tableName || !sessionId || !tableResult) return;
    const enumColumns = tableResult.columns.filter((col) => {
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
    return () => { cancelled = true; };
  }, [isTableMode, sessionId, tableName, schema, tableResult, setEnumValuesByColumn]);

  const resetTableState = useCallback(() => {
    setPage(1);
    setSorting([]);
    setApproximateCount(null);
    setEnumValuesByColumn({});
  }, [setPage, setSorting, setApproximateCount, setEnumValuesByColumn]);

  return {
    tableResult,
    totalCount,
    approximateCount,
    isFetching,
    fetchError,
    page,
    pageSize,
    sorting,
    enumValuesByColumn,
    fkMap,
    setPage,
    setPageSize,
    setSorting,
    fetchTableData,
    resetTableState,
  };
}
