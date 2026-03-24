import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  isLoading?: boolean;
  approximateCount?: number | null;
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
}: PaginationProps) {
  const displayTotal = typeof approximateCount === 'number' && approximateCount > 0
    ? `~${approximateCount.toLocaleString()}`
    : total.toLocaleString();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs select-none">
      <span className="text-zinc-500 dark:text-zinc-400">
        {total > 0 ? `${start.toLocaleString()}–${end.toLocaleString()} of ${displayTotal} rows` : '0 rows'}
      </span>

      <div className="flex-1" />

      <span className="text-zinc-500 dark:text-zinc-400">Rows per page:</span>
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
        Page {page} of {totalPages}
      </span>

      <button
        type="button"
        disabled={!canPrev || isLoading}
        onClick={() => onPageChange(1)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title="First page"
      >
        <ChevronsLeft size={14} />
      </button>
      <button
        type="button"
        disabled={!canPrev || isLoading}
        onClick={() => onPageChange(page - 1)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title="Previous page"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        disabled={!canNext || isLoading}
        onClick={() => onPageChange(page + 1)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title="Next page"
      >
        <ChevronRight size={14} />
      </button>
      <button
        type="button"
        disabled={!canNext || isLoading}
        onClick={() => onPageChange(totalPages)}
        className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
        title="Last page"
      >
        <ChevronsRight size={14} />
      </button>
    </div>
  );
}
