/**
 * Structure as a tab kind (M1) and its persistence (Q5).
 *
 * `'structure'` sat in `TabType` for months with nothing creating such a tab;
 * these pin the store contract now that the shell renders it: dedupe on
 * table+schema+connection, a round trip through the persisted shape, and the
 * filters that keep a broken row from becoming a tab no branch can render.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '../stores/connectionStore';
import {
  useEditorStore,
  fromPersisted,
  toPersisted,
  filterValidTabs,
  type EditorTab,
} from '../stores/editorStore';

function resetStores() {
  useEditorStore.setState({ tabs: [], activeTabId: null });
  useConnectionStore.setState({
    connections: new Map(),
    groups: new Map(),
    selectedConnectionId: 'conn-1',
    connectionStatuses: new Map(),
    sessionIds: new Map(),
  });
}

describe('structure tabs', () => {
  beforeEach(() => resetStores());

  it('addStructureTab creates a structure tab bound to the table and connection', () => {
    const id = useEditorStore.getState().addStructureTab('users', 'public');
    const tab = useEditorStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.type).toBe('structure');
    expect(tab.tableName).toBe('users');
    expect(tab.tableSchema).toBe('public');
    expect(tab.connectionId).toBe('conn-1');
    expect(tab.title).toContain('users');
    expect(useEditorStore.getState().activeTabId).toBe(id);
  });

  it('a second call for the same table activates the existing tab instead of adding one', () => {
    const first = useEditorStore.getState().addStructureTab('users', 'public');
    useEditorStore.getState().addTab('Query');
    const again = useEditorStore.getState().addStructureTab('users', 'public');
    expect(again).toBe(first);
    expect(useEditorStore.getState().tabs.filter((t) => t.type === 'structure')).toHaveLength(1);
    expect(useEditorStore.getState().activeTabId).toBe(first);
  });

  it('a structure tab and a table tab for the same table coexist', () => {
    const table = useEditorStore.getState().addTableTab('users', 'public');
    const structure = useEditorStore.getState().addStructureTab('users', 'public');
    expect(table).not.toBe(structure);
    expect(useEditorStore.getState().tabs).toHaveLength(2);
  });

  it('round-trips tabType "structure" with table and schema through the persisted shape', () => {
    const id = useEditorStore.getState().addStructureTab('orders', null);
    const tab = useEditorStore.getState().tabs.find((t) => t.id === id)!;
    const restored = fromPersisted(toPersisted(tab));
    expect(restored.type).toBe('structure');
    expect(restored.tableName).toBe('orders');
    expect(restored.tableSchema).toBeUndefined();
  });

  it('fromPersisted degrades an unknown tabType to a query tab', () => {
    const restored = fromPersisted({
      id: 'x', title: 'x', content: '', isPinned: false, connectionId: null,
      tabType: 'somethingFromTheFuture', tableName: null, tableSchema: null,
    });
    expect(restored.type).toBe('query');
  });

  it('filterValidTabs drops a structure tab with no table, like an orphaned table tab', () => {
    const base: EditorTab = { id: 's', title: 's', content: '', isDirty: false, isPreview: false, type: 'structure' };
    const kept = filterValidTabs(
      [base, { ...base, id: 'ok', tableName: 'users' }],
      new Set<string>(),
    );
    expect(kept.map((t) => t.id)).toEqual(['ok']);
  });
});
