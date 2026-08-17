import { useState, useCallback, useEffect, useRef } from 'react';
import type { ColumnInfo, QueryResult } from '../../../types/query';
import { isExplainResult, explainColumnWidth } from '../../DataGrid/columnar-render';

export const DEFAULT_COL_WIDTH = 120;
const MIN_COL_WIDTH = 80;
const MAX_AUTO_FIT_WIDTH = 600;
/** w-10 = 2.5rem = 40px; row number column only */
export const FIXED_COLS_WIDTH = 40;

interface UseColumnWidthsProps {
  result: QueryResult;
}

interface UseColumnWidthsReturn {
  visibleColumns: ColumnInfo[];
  resolvedWidths: Record<string, number>;
  totalContentWidth: number;
  hiddenColumns: Set<string>;
  handleResizeStart: (colName: string, startX: number, startWidth: number) => void;
  handleAutoFit: (colName: string) => void;
  handleHideColumn: (colName: string) => void;
}

export function useColumnWidths({ result }: UseColumnWidthsProps): UseColumnWidthsReturn {
  const rows = result.rows;
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const resizeRef = useRef<{ colName: string; startX: number; startWidth: number } | null>(null);

  const visibleColumns = result.columns.filter(c => !hiddenColumns.has(c.name));

  const handleResizeStart = useCallback((colName: string, startX: number, startWidth: number) => {
    resizeRef.current = { colName, startX, startWidth };

    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.max(MIN_COL_WIDTH, resizeRef.current.startWidth + delta);
      setColumnWidths(prev => ({ ...prev, [resizeRef.current!.colName]: newWidth }));
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleAutoFit = useCallback((colName: string) => {
    if (!result) return;

    const colIdx = result.columns.findIndex(c => c.name === colName);
    if (colIdx < 0) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = "12px 'JetBrains Mono', 'Fira Code', Consolas, monospace";

    const col = result.columns[colIdx];
    const headerText = `${col.name} ${col.typeName}`;
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, sans-serif';
    let maxWidth = ctx.measureText(headerText).width;
    if (col.isPrimaryKey) maxWidth += 16;

    ctx.font = "12px 'JetBrains Mono', 'Fira Code', Consolas, monospace";
    const rowsToMeasure = Math.min(rows.length, 100);
    for (let i = 0; i < rowsToMeasure; i++) {
      const cellVal = rows[i]?.[colIdx];
      if (cellVal != null) {
        const textWidth = ctx.measureText(cellVal).width;
        if (textWidth > maxWidth) maxWidth = textWidth;
      }
    }

    const newWidth = Math.min(Math.max(MIN_COL_WIDTH, Math.ceil(maxWidth) + 24), MAX_AUTO_FIT_WIDTH);
    setColumnWidths(prev => ({ ...prev, [colName]: newWidth }));
  }, [result, rows]);

  // Auto-fit all columns on initial data load
  const autoFitDoneRef = useRef<string>('');
  /* eslint-disable react-hooks/set-state-in-effect -- one-time auto-fit on data load */
  useEffect(() => {
    if (!result || result.columns.length === 0 || rows.length === 0) return;
    const fingerprint = result.columns.map(c => c.name).join(',');
    if (autoFitDoneRef.current === fingerprint) return;
    autoFitDoneRef.current = fingerprint;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const monoFont = "12px 'JetBrains Mono', 'Fira Code', Consolas, monospace";
    const sansFont = '12px ui-sans-serif, system-ui, -apple-system, sans-serif';

    const newWidths: Record<string, number> = {};
    for (let colIdx = 0; colIdx < result.columns.length; colIdx++) {
      const col = result.columns[colIdx];
      ctx.font = sansFont;
      const headerText = `${col.name} ${col.typeName}`;
      let maxW = ctx.measureText(headerText).width;
      if (col.isPrimaryKey) maxW += 16;
      ctx.font = monoFont;
      const rowsToMeasure = Math.min(rows.length, 100);
      for (let i = 0; i < rowsToMeasure; i++) {
        const cellVal = rows[i]?.[colIdx];
        if (cellVal != null) {
          const w = ctx.measureText(cellVal).width;
          if (w > maxW) maxW = w;
        }
      }
      newWidths[col.name] = Math.min(Math.max(MIN_COL_WIDTH, Math.ceil(maxW) + 24), MAX_AUTO_FIT_WIDTH);
    }
    setColumnWidths(newWidths);
  }, [result, rows]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleHideColumn = useCallback((colName: string) => {
    setHiddenColumns(prev => new Set([...prev, colName]));
  }, []);

  const resolvedWidths: Record<string, number> = {};
  const explainMode = isExplainResult(result.columns);
  const explainAutoWidth = explainMode
    ? explainColumnWidth(rows as unknown[][])
    : 0;
  for (const col of result.columns) {
    if (explainMode) {
      // EXPLAIN: respect user override if set, else size to content.
      resolvedWidths[col.name] =
        columnWidths[col.name] ?? Math.max(DEFAULT_COL_WIDTH, explainAutoWidth);
    } else {
      resolvedWidths[col.name] = columnWidths[col.name] ?? DEFAULT_COL_WIDTH;
    }
  }

  const columnsTotalWidth = visibleColumns.reduce(
    (sum, col) => sum + (resolvedWidths[col.name] ?? DEFAULT_COL_WIDTH), 0
  );
  const totalContentWidth = FIXED_COLS_WIDTH + columnsTotalWidth;

  return {
    visibleColumns,
    resolvedWidths,
    totalContentWidth,
    hiddenColumns,
    handleResizeStart,
    handleAutoFit,
    handleHideColumn,
  };
}
