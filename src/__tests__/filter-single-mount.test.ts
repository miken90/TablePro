/**
 * Q9 — exactly one `<FilterPanel>` mount exists in the workspace, and the
 * status bar is the only toggle entry point. Two mounts is how a filter
 * applied in one place silently failed to show in the other.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../components/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('FilterPanel has exactly one mount site', () => {
  it('only layout/workspace-body.tsx renders <FilterPanel', () => {
    const sites: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.includes('filter-panel.tsx')) continue;
      if (text.includes('<FilterPanel')) sites.push(path);
    }
    expect(sites).toEqual(['../components/layout/workspace-body.tsx']);
  });

  it('workspace-body.tsx mounts FilterPanel exactly twice (table case, query case)', () => {
    const text = SOURCES['../components/layout/workspace-body.tsx'];
    expect(text).toBeDefined();
    const count = (text.match(/<FilterPanel/g) ?? []).length;
    expect(count).toBe(2);
  });
});
