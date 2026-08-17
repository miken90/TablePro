/**
 * Unknown row count behavior.
 *
 * The table browser issues the row fetch and the count query separately. When
 * the rows arrive but the count fails or times out, the count used to collapse
 * to 0, so the UI reported "0 rows" while rendering a full page. An
 * undeterminable count must be represented as unknown and must not blank a
 * previously known estimate.
 */

import { describe, expect, it } from 'vitest';
import { resolveTotalCount } from './hooks/use-table-data';
import { derivePaginationModel } from './pagination-model';

describe('resolveTotalCount', () => {
  it('returns unknown, not zero, when the count query rejects while rows succeed', async () => {
    const count = await resolveTotalCount(() =>
      Promise.reject(new Error('canceling statement due to statement timeout')),
    );
    expect(count).toBeNull();
    expect(count).not.toBe(0);
  });

  it('returns the exact count when the query succeeds', async () => {
    await expect(resolveTotalCount(() => Promise.resolve(4321))).resolves.toBe(4321);
  });

  it('preserves a genuine zero count', async () => {
    await expect(resolveTotalCount(() => Promise.resolve(0))).resolves.toBe(0);
  });

  it('treats a non-finite count as unknown', async () => {
    await expect(resolveTotalCount(() => Promise.resolve(Number.NaN))).resolves.toBeNull();
    await expect(resolveTotalCount(() => Promise.resolve(Infinity))).resolves.toBeNull();
  });
});

describe('derivePaginationModel with an unknown total', () => {
  it('does not report an empty table while rows are on screen', () => {
    const model = derivePaginationModel({ total: null, page: 1, pageSize: 100, rowsOnPage: 100 });
    expect(model.isUnknownTotal).toBe(true);
    expect(model.hasRows).toBe(true);
    expect(model.start).toBe(1);
    expect(model.end).toBe(100);
  });

  it('offers a next page while the page is full and withholds the last page', () => {
    const model = derivePaginationModel({ total: null, page: 2, pageSize: 100, rowsOnPage: 100 });
    expect(model.canPrev).toBe(true);
    expect(model.canNext).toBe(true);
    // No total means there is no last page to jump to.
    expect(model.totalPages).toBeNull();
    expect(model.start).toBe(101);
    expect(model.end).toBe(200);
  });

  it('stops offering a next page once a partial page arrives', () => {
    const model = derivePaginationModel({ total: null, page: 3, pageSize: 100, rowsOnPage: 42 });
    expect(model.canNext).toBe(false);
    expect(model.end).toBe(242);
  });

  it('reports no rows only when the page is genuinely empty', () => {
    const model = derivePaginationModel({ total: null, page: 1, pageSize: 100, rowsOnPage: 0 });
    expect(model.hasRows).toBe(false);
    expect(model.start).toBe(0);
  });
});

describe('derivePaginationModel with a known total', () => {
  it('keeps the existing arithmetic unchanged', () => {
    const model = derivePaginationModel({ total: 250, page: 2, pageSize: 100, rowsOnPage: 100 });
    expect(model.isUnknownTotal).toBe(false);
    expect(model.totalPages).toBe(3);
    expect(model.canPrev).toBe(true);
    expect(model.canNext).toBe(true);
    expect(model.start).toBe(101);
    expect(model.end).toBe(200);
  });

  it('clamps the last page end to the total', () => {
    const model = derivePaginationModel({ total: 250, page: 3, pageSize: 100, rowsOnPage: 50 });
    expect(model.canNext).toBe(false);
    expect(model.end).toBe(250);
  });

  it('reports an empty table for a real zero count', () => {
    const model = derivePaginationModel({ total: 0, page: 1, pageSize: 100, rowsOnPage: 0 });
    expect(model.hasRows).toBe(false);
    expect(model.totalPages).toBe(1);
    expect(model.canNext).toBe(false);
  });
});
