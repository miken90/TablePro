/**
 * Q9 correction (2026-08-28) — proof that a FilterPanel remount, which
 * happens when the active tab crosses the table/query boundary in
 * workspace-body.tsx's two-branch switch, costs the user nothing.
 *
 * The data a user actually builds — conditions, AND/OR logic, the applied
 * WHERE clause — lives in `useFilterStore`, keyed by tabId, not in
 * FilterPanel's own component state. `initializeTab` is a no-op once a tab
 * has an entry, so remounting FilterPanel for a tab that already has state
 * (exactly what happens switching back to a table tab after visiting a
 * query tab) reattaches to the same data rather than resetting it.
 *
 * FilterPanel's only local `useState` (presets list, selected preset, a
 * pending debounce timer) is presentational and table-scoped: presets are
 * gated behind `tableName`, which is genuinely different on each side of a
 * table/query crossing, so re-deriving it on remount is correct, not lossy.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useFilterStore } from '../stores/filterStore';

beforeEach(() => {
  useFilterStore.setState({ byTab: {} });
});

describe('filter conditions survive a FilterPanel remount', () => {
  it('initializeTab is a no-op once a tab already has state', () => {
    const { initializeTab, addCondition, setLogic } = useFilterStore.getState();
    initializeTab('table-tab');
    addCondition('table-tab');
    setLogic('table-tab', 'OR');

    const before = useFilterStore.getState().byTab['table-tab'];
    expect(before.conditions).toHaveLength(2);
    expect(before.logic).toBe('OR');

    // What FilterPanel's mount effect calls every time it (re)mounts.
    initializeTab('table-tab');

    const after = useFilterStore.getState().byTab['table-tab'];
    expect(after).toBe(before); // same object — set() bailed out, no reset
    expect(after.conditions).toHaveLength(2);
    expect(after.logic).toBe('OR');
  });

  it('crossing to a different tab and back leaves the original tab untouched', () => {
    const { initializeTab, addCondition, applyFilter } = useFilterStore.getState();

    // Table tab: user builds a filter and applies it.
    initializeTab('table-tab');
    addCondition('table-tab');
    useFilterStore.getState().updateCondition('table-tab', useFilterStore.getState().byTab['table-tab'].conditions[0].id, {
      id: useFilterStore.getState().byTab['table-tab'].conditions[0].id,
      column: 'status',
      operator: '=',
      value: 'active',
      enabled: true,
    });
    applyFilter('table-tab');
    const appliedClause = useFilterStore.getState().byTab['table-tab'].appliedFilterClause;
    expect(appliedClause).toContain('status');

    // User switches to a query tab — the table branch's FilterPanel instance
    // unmounts (different switch case), the query branch's mounts for a
    // different tabId.
    initializeTab('query-tab');
    expect(useFilterStore.getState().byTab['query-tab'].conditions).not.toBe(
      useFilterStore.getState().byTab['table-tab'].conditions,
    );

    // User switches back to the table tab — a fresh FilterPanel instance
    // mounts and calls initializeTab again.
    initializeTab('table-tab');

    const restored = useFilterStore.getState().byTab['table-tab'];
    expect(restored.appliedFilterClause).toBe(appliedClause);
    expect(restored.conditions.some((c) => c.column === 'status' && c.value === 'active')).toBe(true);
  });
});
