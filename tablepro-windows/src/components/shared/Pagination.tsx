import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000];

export function Pagination({ page, pageSize, totalRows, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800">
      {/* Row count */}
      <span className="text-zinc-500 dark:text-zinc-400">
        {totalRows > 0 ? `${start}–${end} of ${totalRows.toLocaleString()}` : "0 rows"}
      </span>

      <div className="flex-1" />

      {/* Page size */}
      <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
        <span>Rows:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-700"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Prev / Next */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="px-1 text-zinc-500 dark:text-zinc-400">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
