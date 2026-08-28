/**
 * D3 — the pending-changes strip renders on `hasChanges` and nothing else.
 *
 * The bar this replaces was guarded on three terms: staged changes, a table
 * name prop, and a hide flag its only call site set. Two of the three had
 * nothing to do with whether there was anything to save, and the third turned
 * the whole feature off. Asserting the guard as source text is the only way
 * to keep the extra terms from creeping back.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`/src/${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('pending-changes strip render guard', () => {
  const strip = () => source('components/grid/pending-changes-strip.tsx');

  it('returns null on hasChanges alone', () => {
    expect(strip()).toContain('if (!hasChanges) return null;');
  });

  it('has no table-name or hide-flag term anywhere', () => {
    expect(strip()).not.toContain('tableName');
    expect(strip()).not.toContain('hideChangeToolbar');
  });

  it('nothing under src/ passes a hide flag any more', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, text]) => text.includes('hideChangeToolbar'))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the dead ChangeToolbar is gone, not merely unmounted', () => {
    expect(SOURCES['/src/components/grid/change-toolbar.tsx']).toBeUndefined();
  });

  it('the strip is mounted from the result panel', () => {
    expect(source('components/grid/result-panel.tsx')).toContain('<PendingChangesStrip');
  });
});
