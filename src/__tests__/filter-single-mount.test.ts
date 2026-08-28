/**
 * Q9 — exactly one `<FilterPanel>` mount is LIVE at any time, and the status
 * bar is the only toggle entry point. Two SIMULTANEOUS mounts is the SCR-26
 * defect Q9 removed: a filter applied in one place silently failing to show
 * in the other.
 *
 * workspace-body.tsx has two `<FilterPanel` call sites, one per `view.kind`
 * branch of a single `switch` — not the single call site the phase file's
 * requirement 3 literally describes. Chief-reviewed correction (2026-08-28):
 * this is the right shape, not a regression toward the SCR-26 defect, because
 * (1) the two branches are mutually exclusive by construction (a `switch` can
 * never render two cases at once, so two mounted panels for one tab is
 * structurally impossible — the actual thing Q9 forbids), and (2) a table tab
 * and a query tab are different tabs with independent state already: the
 * table branch positions the panel under the row-action bar and the query
 * branch positions it under the tab bar, per the phase file's own
 * Architecture note, which a single hoisted call site above the switch
 * cannot do without breaking one of those two positions. See
 * `filter-remount-state.test.ts` for the proof that crossing the table/query
 * boundary costs nothing a user would notice: filter conditions live in
 * `useFilterStore`, keyed by tabId, independent of whether any FilterPanel
 * component instance is currently mounted.
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

  it('both mounts sit inside mutually exclusive case branches of one switch(view.kind)', () => {
    const text = SOURCES['../components/layout/workspace-body.tsx'];
    expect(text).toBeDefined();

    const switchCount = (text.match(/switch\s*\(view\.kind\)/g) ?? []).length;
    expect(switchCount, 'exactly one switch(view.kind) — two would defeat mutual exclusivity').toBe(1);

    const tableCaseIdx = text.indexOf('case "table":');
    const queryCaseIdx = text.indexOf('case "query":');
    expect(tableCaseIdx).toBeGreaterThan(-1);
    expect(queryCaseIdx).toBeGreaterThan(-1);
    expect(tableCaseIdx).toBeLessThan(queryCaseIdx);

    const filterPanelIndices = [...text.matchAll(/<FilterPanel/g)].map((m) => m.index!);
    expect(filterPanelIndices).toHaveLength(2);
    // First site sits in the "table" branch (after "case table", before "case query").
    expect(filterPanelIndices[0]).toBeGreaterThan(tableCaseIdx);
    expect(filterPanelIndices[0]).toBeLessThan(queryCaseIdx);
    // Second site sits in the "query" branch (after "case query").
    expect(filterPanelIndices[1]).toBeGreaterThan(queryCaseIdx);
  });
});
