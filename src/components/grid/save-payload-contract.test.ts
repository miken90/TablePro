/**
 * Grid → backend save contract.
 *
 * The backend decided how to quote a cell by looking at the value: anything
 * that parsed as a number was emitted unquoted, so a varchar postcode `007`
 * was stored as `7` and the literal string `true` became `1`. Quoting is now
 * driven by the column's declared type, which only the frontend knows — every
 * save payload must carry it.
 *
 * Both save paths are asserted as source text: this vitest setup runs in
 * `node` with no DOM, so the hooks cannot be rendered, and what matters is
 * that the field is populated at all.
 */

import { describe, expect, it } from 'vitest';
import { resolveTotalCount } from './hooks/use-table-data';

const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`./${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

const SAVE_PATHS = ['use-table-save.ts', 'hooks/use-change-tracking.ts'];

describe('save payload carries column types', () => {
  for (const path of SAVE_PATHS) {
    it(`${path} reads the declared types off the result columns`, () => {
      const text = source(path);
      expect(text).toContain('const columnTypes = result.columns.map(c => c.typeName || null);');
      expect(text).toContain('columnTypes,');
    });
  }

  it('both paths build the payload from the same column list', () => {
    for (const path of SAVE_PATHS) {
      const text = source(path);
      // Types must line up positionally with the names, so both come from
      // `result.columns` in the same order.
      const namesAt = text.indexOf('result.columns.map(c => c.name)');
      const typesAt = text.indexOf('result.columns.map(c => c.typeName');
      expect(namesAt).toBeGreaterThan(-1);
      expect(typesAt).toBeGreaterThan(namesAt);
    }
  });
});

describe('an undeterminable row count stays unknown', () => {
  it('treats an explicit null from the backend as unknown', async () => {
    // `fetch_count` now answers null instead of fabricating 0.
    await expect(resolveTotalCount(() => Promise.resolve(null))).resolves.toBeNull();
  });

  it('still preserves a genuine zero', async () => {
    await expect(resolveTotalCount(() => Promise.resolve(0))).resolves.toBe(0);
  });
});
