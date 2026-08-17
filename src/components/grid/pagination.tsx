import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { derivePaginationModel } from './pagination-model';

interface PaginationProps {
  /** Exact row count, or `null` when it could not be determined. */
  total: number | null;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  isLoading?: boolean;
  approximateCount?: number | null;
  /** Rows actually rendered on the current page. Used to decide whether a
   *  next page exists when the total is unknown. */
  rowsOnPage?: number;
}

const PAGE_SIZES = [50, 100, 500, 1000, 5000];

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
  approximateCount,
  rowsOnPage = 0,
}: PaginationProps) {
  const { t } = useTranslation();
  const { isUnknownTotal, totalPages, canPrev, canNext, hasRows, start, end } =
    derivePaginationModel({ total, page, pageSize, rowsOnPage });
  const approx = typeof approximateCount === 'number' && approximateCount > 0
    ? `~${approximateCount.toLocaleString()}`
    : null;
  // With no exact count, fall back to the approximate estimate, and only then
  // to an explicit "unknown" — never to a fabricated 0.
  const displayTotal = approx
    ?? (isUnknownTotal ? t("grid.pagination.unknownTotal") : (total ?? 0).toLocaleString());

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs select-none">
      <span className="text-zinc-500 dark:text-zinc-400">
        {hasRows ? t("grid.pagination.showing", { start: start.toLocaleString(), end: end.toLocaleString(), total: displayTotal }) : t("grid.pagination.zeroRows")}
      </span>

      <div className="flex-1" />

      <span className="text-zinc-500 dark:text-zinc-400">{t("grid.pagination.rowsPerPage")}</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        disabled={isLoading}
        className="border border-zinc-300 dark:border-zinc-600 rounded px-1 py-0.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs disabled:opacity-50"
      >
        {PAGE_SIZES.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <span className="text-zinc-500 dark:text-zinc-400">
        {totalPages === null
          ? t("grid.pagination.pageUnknownTotal", { page })
          : t("grid.pagination.pageOf", { page, total: totalPages })}
      </span>

      <button
        type="button"
        disabled={!canPrev || isLoading}
        onClick={() => onPageChange(1)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title={t("grid.pagination.firstPage")}
      >
        <ChevronsLeft size={14} />
      </button>
      <button
        type="button"
        disabled={!canPrev || isLoading}
        onClick={() => onPageChange(page - 1)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title={t("grid.pagination.previousPage")}
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        disabled={!canNext || isLoading}
        onClick={() => onPageChange(page + 1)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title={t("grid.pagination.nextPage")}
      >
        <ChevronRight size={14} />
      </button>
      <button
        type="button"
        disabled={totalPages === null || !canNext || isLoading}
        onClick={() => totalPages !== null && onPageChange(totalPages)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title={totalPages === null ? t("grid.pagination.lastPageUnknown") : t("grid.pagination.lastPage")}
      >
        <ChevronsRight size={14} />
      </button>
    </div>
  );
}
