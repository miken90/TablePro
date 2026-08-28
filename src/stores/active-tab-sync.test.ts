/**
 * `syncActiveTabContext` is the single function that replaced three
 * near-identical shell callbacks. It scopes the change store to a table tab
 * and releases that scope for every other kind — without touching any
 * table's staged edits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '../stores/connectionStore';
import { useEditorStore } from '../stores/editorStore';
import { useChangeStore } from '../stores/changeStore';
import { useLayoutStore } from '../stores/layoutStore';
import { syncActiveTabContext, openTableTab, openStructureTab, activateQueryTab, installActiveTabSync, registerCloseTabHandler, requestCloseTab } from '../stores/active-tab-sync';

function resetStores() {
  useEditorStore.setState({ tabs: [], activeTabId: null });
  useChangeStore.setState({ _byTable: {}, _activeTableKey: null });
  useLayoutStore.setState({ inspectorVisible: true, queryInspectorVisible: true, queryInspectorPreferenceSet: false });
  useConnectionStore.setState({
    connections: new Map(),
    groups: new Map(),
    selectedConnectionId: 'conn-1',
    connectionStatuses: new Map(),
    sessionIds: new Map(),
  });
}

describe('syncActiveTabContext', () => {
  beforeEach(() => resetStores());

  it('scopes the change store to a table tab', () => {
    const id = useEditorStore.getState().addTableTab('users', 'public');
    syncActiveTabContext(id);
    expect(useChangeStore.getState()._activeTableKey).toBe('conn-1:public:users');
  });

  it('releases the scope for a query tab without touching staged edits', () => {
    const table = openTableTab('users', 'public');
    useChangeStore.getState().recordCellChange({ rowIndex: 0, columnIndex: 1, columnName: 'name', oldValue: 'a', newValue: 'b' });
    expect(useChangeStore.getState().hasChanges).toBe(true);

    const query = useEditorStore.getState().addTab('Q');
    syncActiveTabContext(query);
    expect(useChangeStore.getState()._activeTableKey).toBeNull();
    expect(useChangeStore.getState().hasChanges).toBe(false);
    expect(Object.keys(useChangeStore.getState()._byTable['conn-1:public:users'].changes)).toHaveLength(1);

    syncActiveTabContext(table);
    expect(useChangeStore.getState().hasChanges).toBe(true);
  });

  it('releases the scope for a structure tab', () => {
    openTableTab('users', 'public');
    const structure = openStructureTab('users', 'public');
    syncActiveTabContext(structure);
    expect(useChangeStore.getState()._activeTableKey).toBeNull();
  });

  it('is a no-op for an unknown id and releases for null', () => {
    openTableTab('users', 'public');
    syncActiveTabContext('nope');
    expect(useChangeStore.getState()._activeTableKey).toBe('conn-1:public:users');
    syncActiveTabContext(null);
    expect(useChangeStore.getState()._activeTableKey).toBeNull();
  });

  it('hides the inspector for a table tab and restores the query preference otherwise', () => {
    openTableTab('users', 'public');
    expect(useLayoutStore.getState().inspectorVisible).toBe(false);
    useLayoutStore.setState({ queryInspectorVisible: true, queryInspectorPreferenceSet: true });
    syncActiveTabContext(useEditorStore.getState().addTab('Q'));
    expect(useLayoutStore.getState().inspectorVisible).toBe(true);
  });

  it('activateQueryTab reuses the latest query tab or creates one, and syncs', () => {
    openTableTab('users', 'public');
    const created = activateQueryTab();
    expect(useEditorStore.getState().tabs.find((t) => t.id === created)?.type).toBe('query');
    expect(useEditorStore.getState().activeTabId).toBe(created);
    expect(useChangeStore.getState()._activeTableKey).toBeNull();

    openTableTab('users', 'public');
    expect(activateQueryTab()).toBe(created);
  });

  it('installActiveTabSync makes any activeTabId write sync, whoever wrote it', () => {
    const uninstall = installActiveTabSync();
    try {
      const table = useEditorStore.getState().addTableTab('users', 'public');
      // A bare store write — the path Ctrl+Tab, close-others, vim and FK navigation take.
      useEditorStore.getState().setActiveTab(table);
      expect(useChangeStore.getState()._activeTableKey).toBe('conn-1:public:users');
      const query = useEditorStore.getState().addTab('Q');
      expect(useEditorStore.getState().activeTabId).toBe(query);
      expect(useChangeStore.getState()._activeTableKey).toBeNull();
      useEditorStore.getState().closeTab(query);
      expect(useChangeStore.getState()._activeTableKey).toBe('conn-1:public:users');
    } finally {
      uninstall();
    }
  });

  it('requestCloseTab goes through the registered guard, else closes directly', () => {
    const id = useEditorStore.getState().addTab('Q');
    const seen: string[] = [];
    registerCloseTabHandler((tabId) => seen.push(tabId));
    requestCloseTab(id);
    expect(seen).toEqual([id]);
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    registerCloseTabHandler(null);
    requestCloseTab(id);
    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });
});
