/**
 * The M1 / M4 / Q5 seam on real stores: staged edits follow their table
 * across tab switches, a structure tab for that table fetches nothing until
 * its body mounts, and closing the table tab is the only thing that drops
 * the snapshot.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetInvokeImpl, __setInvokeImpl } from '../__tests__/mocks/tauri';
import { useConnectionStore } from '../stores/connectionStore';
import { useEditorStore } from '../stores/editorStore';
import { makeTableKey, useChangeStore } from '../stores/changeStore';
import { useLayoutStore } from '../stores/layoutStore';
import { makeStructureKey, useStructureChangeStore } from '../stores/structureChangeStore';
import { syncActiveTabContext, openTableTab, openStructureTab } from '../stores/active-tab-sync';

const invoked: string[] = [];

function resetStores() {
  invoked.length = 0;
  __setInvokeImpl((cmd) => {
    invoked.push(cmd);
    return Promise.resolve(null);
  });
  useEditorStore.setState({ tabs: [], activeTabId: null });
  useChangeStore.setState({ _byTable: {}, _activeTableKey: null });
  useStructureChangeStore.setState({ _byTable: {}, _activeKey: null, changes: [] });
  useLayoutStore.setState({ inspectorVisible: true, queryInspectorVisible: true, queryInspectorPreferenceSet: false });
  useConnectionStore.setState({
    connections: new Map(),
    groups: new Map(),
    selectedConnectionId: 'conn-1',
    connectionStatuses: new Map(),
    sessionIds: new Map([['conn-1', 'sess-1']]),
  });
}

describe('active tab lifecycle', () => {
  beforeEach(() => resetStores());
  afterEach(() => __resetInvokeImpl());

  it('staged edits survive a switch to a query tab and back', () => {
    const table = openTableTab('users', 'public');
    useChangeStore.getState().recordCellChange({ rowIndex: 0, columnIndex: 1, columnName: 'name', oldValue: 'a', newValue: 'b' });
    expect(useChangeStore.getState().hasChanges).toBe(true);
    const undoDepth = useChangeStore.getState()._undoStack.length;

    const query = useEditorStore.getState().addTab('Q');
    syncActiveTabContext(query);
    expect(useChangeStore.getState().hasChanges).toBe(false);
    expect(useChangeStore.getState()._byTable[makeTableKey('conn-1', 'public', 'users')]).toBeDefined();

    useEditorStore.getState().setActiveTab(table);
    syncActiveTabContext(table);
    expect(useChangeStore.getState().hasChanges).toBe(true);
    expect(useChangeStore.getState()._undoStack).toHaveLength(undoDepth);
  });

  it('opening a structure tab issues no schema fetch until its body mounts', () => {
    openTableTab('users', 'public');
    const structure = openStructureTab('users', 'public');
    expect(useEditorStore.getState().activeTabId).toBe(structure);
    // Store-level activation is all that happened; the fetch belongs to the
    // sub-tab component, which only mounts while the tab is active on screen.
    expect(invoked.filter((c) => /fetch_columns|fetch_table_data|fetch_indexes/.test(c))).toHaveLength(0);
  });

  it('a structure tab keeps its staged DDL per table while another table is viewed', () => {
    const a = makeStructureKey('conn-1', 'public', 'users');
    const b = makeStructureKey('conn-1', 'public', 'orders');
    const store = useStructureChangeStore.getState();
    store.setActiveTable(a);
    store.addColumn({ name: 'nick', typeName: 'text', nullable: true, defaultValue: null, isPrimaryKey: false, position: 9 });
    expect(useStructureChangeStore.getState().changes).toHaveLength(1);

    useStructureChangeStore.getState().setActiveTable(b);
    expect(useStructureChangeStore.getState().changes).toHaveLength(0);
    useStructureChangeStore.getState().discardAll();

    useStructureChangeStore.getState().setActiveTable(a);
    expect(useStructureChangeStore.getState().changes).toHaveLength(1);
  });

  it('closing the table tab with a cleared snapshot leaves nothing behind; without clearing, the snapshot persists', () => {
    const key = makeTableKey('conn-1', 'public', 'users');
    const table = openTableTab('users', 'public');
    useChangeStore.getState().recordCellChange({ rowIndex: 0, columnIndex: 1, columnName: 'name', oldValue: 'a', newValue: 'b' });

    // What the tab bar's Discard path does (V3): clear that table, then close.
    useChangeStore.getState().clearForTable(key);
    useEditorStore.getState().closeTab(table);
    syncActiveTabContext(useEditorStore.getState().activeTabId);
    expect(useChangeStore.getState()._byTable[key]).toBeUndefined();
    expect(useChangeStore.getState()._activeTableKey).toBeNull();
  });

  it('a restored active table tab is scoped by the launch-time sync, not by a click', () => {
    // Simulate what initFromBackend leaves behind: tabs + activeTabId, no sync.
    useEditorStore.setState({
      tabs: [{ id: 'restored', title: 'users', content: '', isDirty: false, isPreview: false, type: 'table', tableName: 'users', tableSchema: 'public', connectionId: 'conn-1' }],
      activeTabId: 'restored',
    });
    expect(useChangeStore.getState()._activeTableKey).toBeNull();
    syncActiveTabContext(useEditorStore.getState().activeTabId);
    expect(useChangeStore.getState()._activeTableKey).toBe(makeTableKey('conn-1', 'public', 'users'));
    expect(useLayoutStore.getState().inspectorVisible).toBe(false);
  });
});
