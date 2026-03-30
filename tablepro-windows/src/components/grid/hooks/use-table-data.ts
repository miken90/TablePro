import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useSchemaStore } from '../../../stores/schemaStore';
import { useQueryLogStore } from '../../../stores/queryLogStore';
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

interface UseTableDataProps {
  tableName?: string;
  schema?: string | null;
  sessionId?: string;
  activeWhereClause?: string;
}

export interface UseTableDataReturn {
  tableResult: QueryResult | null;
  totalCount: number;
  approximateCount: number | null;
  isFetching: boolean;
  fetchError: string | null;
  page: number;
  pageSize: number;
  sorting: SortingState;
  enumValuesByColumn: Record<string, string[]>;
  fkMap: Record<string, Record<string, import('../../../stores/schemaStore').FkRef>>;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  fetchTableData: (
    sid: string, tbl: string, sch: string | null,
    pg: number, ps: number, where: string | null, sort: SortingState,
  ) => Promise<void>;
  resetTableState: () => void;
}

export function useTableData({
  tableName, schema, sessionId, activeWhereClause,
}: UseTableDataProps): UseTableDataReturn {
  const [tableResult, setTableResult] = useState<QueryResult | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [approximateCount, setApproximateCount] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [enumValuesByColumn, setEnumValuesByColumn] = useState<Record<string, string[]>>({});
  const fetchSeqRef = useRef(0);

  const isTableMode = !!tableName && !!sessionId;
  const fkMap = useSchemaStore((s) => s.fkMap);
  const fetchForeignKeysForTable = useSchemaStore((s) => s.fetchForeignKeysForTable);

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
      const errorMsg = extractErrorMessage(err);
      setFetchError(errorMsg);
      setTableResult(null);
      setTotalCount(0);
      useQueryLogStore.getState().update(logId, { status: 'error', durationMs: Date.now() - startMs, error: errorMsg });
    } finally {
      if (seq === fetchSeqRef.current) setIsFetching(false);
    }
  }, []);

  // Fetch table data when dependencies change
  useEffect(() => {
    if (!isTableMode) {
      setTableResult(null);
      setTotalCount(0);
      setApproximateCount(null);
      return;
    }
    fetchTableData(sessionId!, tableName!, schema ?? null, page, pageSize, activeWhereClause ?? null, sorting);
  }, [isTableMode, sessionId, tableName, schema, page, pageSize, activeWhereClause, sorting, fetchTableData]);

  // Reset state when table changes
  const prevTableRef = useRef(tableName);
  const prevFilterRef = useRef(activeWhereClause);
  useEffect(() => {
    if (prevTableRef.current !== tableName) {
      setPage(1);
      setSorting([]);
      setApproximateCount(null);
      setEnumValuesByColumn({});
      prevTableRef.current = tableName;
    }
    if (prevFilterRef.current !== activeWhereClause) {
      setPage(1);
      prevFilterRef.current = activeWhereClause;
    }
  }, [tableName, activeWhereClause]);

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
  }, [isTableMode, sessionId, tableName, schema]);

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
  }, [isTableMode, sessionId, tableName, schema, tableResult]);

  const resetTableState = useCallback(() => {
    setPage(1);
    setSorting([]);
    setApproximateCount(null);
    setEnumValuesByColumn({});
  }, []);

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
