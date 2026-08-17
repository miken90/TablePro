/**
 * Pure pagination arithmetic, split out of `pagination.tsx` so the
 * unknown-total behavior is testable in the node-environment vitest setup.
 *
 * `total === null` means the count query failed or timed out. That is *not*
 * zero rows: the grid may be showing a full page while the count is unknown,
 * so every derived figure has to degrade honestly instead of collapsing.
 */

export interface PaginationModelArgs {
  /** Exact row count, or `null` when it could not be determined. */
  total: number | null;
  page: number;
  pageSize: number;
  /** Rows actually rendered on the current page. */
  rowsOnPage: number;
}

export interface PaginationModel {
  isUnknownTotal: boolean;
  /** `null` when the total is unknown — there is no last page to jump to. */
  totalPages: number | null;
  canPrev: boolean;
  canNext: boolean;
  hasRows: boolean;
  start: number;
  end: number;
}

export function derivePaginationModel({
  total,
  page,
  pageSize,
  rowsOnPage,
}: PaginationModelArgs): PaginationModel {
  const isUnknownTotal = total === null;

  if (isUnknownTotal) {
    const hasRows = rowsOnPage > 0;
    return {
      isUnknownTotal: true,
      totalPages: null,
      canPrev: page > 1,
      // A full page is the only evidence left that more rows follow.
      canNext: rowsOnPage >= pageSize,
      hasRows,
      start: hasRows ? (page - 1) * pageSize + 1 : 0,
      end: (page - 1) * pageSize + rowsOnPage,
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasRows = total > 0;
  return {
    isUnknownTotal: false,
    totalPages,
    canPrev: page > 1,
    canNext: page < totalPages,
    hasRows,
    start: hasRows ? (page - 1) * pageSize + 1 : 0,
    end: Math.min(page * pageSize, total),
  };
}
