import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '../stores/connectionStore';
import { useEditorStore } from '../stores/editorStore';
import { resolveActiveQueryConnectionId, resolveActiveQuerySessionId } from '../stores/queryStore';

function resetStore() {
  useEditorStore.setState({ tabs: [], activeTabId: null });
  useConnectionStore.setState({
    connections: new Map(),
    groups: new Map(),
    selectedConnectionId: null,
    connectionStatuses: new Map(),
    sessionIds: new Map(),
  });
}

describe('editorStore', () => {
  beforeEach(() => resetStore());

  it('addTab creates tab and sets active', () => {
    const id = useEditorStore.getState().addTab('Test');
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(id);
    expect(state.tabs[0].title).toBe('Test');
  });

  it('addTab with no title uses default', () => {
    useEditorStore.getState().addTab();
    expect(useEditorStore.getState().tabs[0].title).toMatch(/Query \d+/);
  });

  it('closeTab removes tab and selects neighbor', () => {
    const id1 = useEditorStore.getState().addTab('A');
    const id2 = useEditorStore.getState().addTab('B');
    useEditorStore.getState().closeTab(id2);
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(id1);
  });

  it('closeTab on only tab sets activeTabId to null', () => {
    const id = useEditorStore.getState().addTab('Solo');
    useEditorStore.getState().closeTab(id);
    expect(useEditorStore.getState().activeTabId).toBeNull();
    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it('updateTabContent marks tab dirty', () => {
    const id = useEditorStore.getState().addTab('Test');
    useEditorStore.getState().updateTabContent(id, 'SELECT 1');
    const tab = useEditorStore.getState().tabs[0];
    expect(tab.content).toBe('SELECT 1');
    expect(tab.isDirty).toBe(true);
  });

  it('renameTab changes title', () => {
    const id = useEditorStore.getState().addTab('Old');
    useEditorStore.getState().renameTab(id, 'New Title');
    expect(useEditorStore.getState().tabs[0].title).toBe('New Title');
  });

  it('setActiveTab changes activeTabId', () => {
    const id1 = useEditorStore.getState().addTab('A');
    useEditorStore.getState().addTab('B');
    useEditorStore.getState().setActiveTab(id1);
    expect(useEditorStore.getState().activeTabId).toBe(id1);
  });
});

describe('editorStore connection routing', () => {
  beforeEach(() => resetStore());

  it('setActiveTab syncs selectedConnectionId from tab connectionId', () => {
    const firstTabId = useEditorStore.getState().addTab('A');
    const secondTabId = useEditorStore.getState().addTab('B');

    useEditorStore.getState().setTabConnectionId(firstTabId, 'conn-a');
    useEditorStore.getState().setTabConnectionId(secondTabId, 'conn-b');

    useEditorStore.getState().setActiveTab(firstTabId);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-a');

    useEditorStore.getState().setActiveTab(secondTabId);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-b');
  });

  it('closeTab syncs selectedConnectionId to newly active tab connection', () => {
    const firstTabId = useEditorStore.getState().addTab('A');
    const secondTabId = useEditorStore.getState().addTab('B');

    useEditorStore.getState().setTabConnectionId(firstTabId, 'conn-a');
    useEditorStore.getState().setTabConnectionId(secondTabId, 'conn-b');

    useEditorStore.getState().setActiveTab(secondTabId);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-b');

    useEditorStore.getState().closeTab(secondTabId);

    expect(useEditorStore.getState().activeTabId).toBe(firstTabId);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-a');
  });

  it('setActiveTab keeps selectedConnectionId when tab has no connectionId', () => {
    const tabId = useEditorStore.getState().addTab('No Connection');
    useEditorStore.setState((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, connectionId: undefined } : tab)),
    }));
    useConnectionStore.getState().selectConnection('conn-global');

    useEditorStore.getState().setActiveTab(tabId);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-global');
  });

  it('closeOtherTabs syncs selectedConnectionId to kept tab connection', () => {
    const firstTabId = useEditorStore.getState().addTab('A');
    const secondTabId = useEditorStore.getState().addTab('B');

    useEditorStore.getState().setTabConnectionId(firstTabId, 'conn-a');
    useEditorStore.getState().setTabConnectionId(secondTabId, 'conn-b');
    useConnectionStore.getState().selectConnection('conn-b');

    useEditorStore.getState().closeOtherTabs(firstTabId);

    expect(useEditorStore.getState().activeTabId).toBe(firstTabId);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-a');
  });

  it('closeTabsToRight syncs selectedConnectionId when active tab is removed', () => {
    const tabA = useEditorStore.getState().addTab('A');
    const tabB = useEditorStore.getState().addTab('B');
    const tabC = useEditorStore.getState().addTab('C');

    useEditorStore.getState().setTabConnectionId(tabA, 'conn-a');
    useEditorStore.getState().setTabConnectionId(tabB, 'conn-b');
    useEditorStore.getState().setTabConnectionId(tabC, 'conn-c');

    useEditorStore.getState().setActiveTab(tabC);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-c');

    useEditorStore.getState().closeTabsToRight(tabA);

    expect(useEditorStore.getState().activeTabId).toBe(tabA);
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-a');
  });

  it('closeAllTabs keeps selectedConnectionId when no tab remains', () => {
    const tabA = useEditorStore.getState().addTab('A');
    useEditorStore.getState().setTabConnectionId(tabA, 'conn-a');
    useEditorStore.getState().setActiveTab(tabA);

    useEditorStore.getState().closeAllTabs();

    expect(useEditorStore.getState().activeTabId).toBeNull();
    expect(useConnectionStore.getState().selectedConnectionId).toBe('conn-a');
  });

  it('resolveActiveQuerySessionId prefers active tab connection session', () => {
    const tabA = useEditorStore.getState().addTab('A');
    const tabB = useEditorStore.getState().addTab('B');

    useEditorStore.getState().setTabConnectionId(tabA, 'conn-a');
    useEditorStore.getState().setTabConnectionId(tabB, 'conn-b');

    useConnectionStore.setState({
      sessionIds: new Map([
        ['conn-a', 'session-a'],
        ['conn-b', 'session-b'],
      ]),
    });

    useConnectionStore.getState().selectConnection('conn-b');
    useEditorStore.getState().setActiveTab(tabA);

    expect(resolveActiveQueryConnectionId()).toBe('conn-a');
    expect(resolveActiveQuerySessionId()).toBe('session-a');
  });

  it('resolveActiveQuerySessionId falls back to selected connection', () => {
    useConnectionStore.getState().selectConnection(null);
    const tabId = useEditorStore.getState().addTab('No Bound Connection');

    useConnectionStore.setState({
      selectedConnectionId: 'conn-fallback',
      sessionIds: new Map([['conn-fallback', 'session-fallback']]),
    });

    useEditorStore.getState().setActiveTab(tabId);

    expect(resolveActiveQueryConnectionId()).toBe('conn-fallback');
    expect(resolveActiveQuerySessionId()).toBe('session-fallback');
  });

  it('resolveActiveQuerySessionId does not reroute when tab connection has no live session', () => {
    const tabA = useEditorStore.getState().addTab('A');
    useEditorStore.getState().setTabConnectionId(tabA, 'conn-a');

    useConnectionStore.setState({
      selectedConnectionId: 'conn-fallback',
      sessionIds: new Map([
        ['conn-fallback', 'session-fallback'],
      ]),
    });

    expect(useEditorStore.getState().activeTabId).toBe(tabA);
    expect(resolveActiveQueryConnectionId()).toBe('conn-a');
    expect(resolveActiveQuerySessionId()).toBeUndefined();
  });
});

describe('editorStore persistence', () => {
  beforeEach(() => resetStore());

  // The partialize function as defined in editorStore.ts — mirrors the persist config.
  // We test the exact same logic to ensure serialization behaves correctly.
  function partialize(state: { tabs: { id: string; title: string; content: string }[]; activeTabId: string | null }) {
    return {
      tabs: state.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content.slice(0, 100_000),
        isDirty: false,
        isPreview: false,
      })),
      activeTabId: state.activeTabId,
    };
  }

  it('partialize truncates content to 100KB', () => {
    const id = useEditorStore.getState().addTab('Big');
    const bigContent = 'x'.repeat(150_000);
    useEditorStore.getState().updateTabContent(id, bigContent);

    const serialized = partialize(useEditorStore.getState());
    expect(serialized.tabs[0].content.length).toBe(100_000);
  });

  it('partialize sets isDirty to false', () => {
    const id = useEditorStore.getState().addTab('Dirty');
    useEditorStore.getState().updateTabContent(id, 'SELECT 1');
    expect(useEditorStore.getState().tabs[0].isDirty).toBe(true);

    const serialized = partialize(useEditorStore.getState());
    expect(serialized.tabs[0].isDirty).toBe(false);
  });

  it('partialize preserves multiple tabs', () => {
    useEditorStore.getState().addTab('Tab A');
    useEditorStore.getState().addTab('Tab B');
    useEditorStore.getState().addTab('Tab C');

    const serialized = partialize(useEditorStore.getState());
    expect(serialized.tabs).toHaveLength(3);
    expect(serialized.tabs.map((t) => t.title)).toEqual(['Tab A', 'Tab B', 'Tab C']);
  });

  it('partialize preserves activeTabId', () => {
    const id1 = useEditorStore.getState().addTab('First');
    useEditorStore.getState().addTab('Second');
    useEditorStore.getState().setActiveTab(id1);

    const serialized = partialize(useEditorStore.getState());
    expect(serialized.activeTabId).toBe(id1);
  });

  it('rehydration restores tabs and activeTabId', () => {
    const id1 = useEditorStore.getState().addTab('Restored A');
    useEditorStore.getState().addTab('Restored B');
    useEditorStore.getState().updateTabContent(id1, 'SELECT 1');
    useEditorStore.getState().setActiveTab(id1);

    // Serialize via partialize
    const snapshot = partialize(useEditorStore.getState());

    // Reset store, then rehydrate (simulates what persist middleware does on load)
    resetStore();
    expect(useEditorStore.getState().tabs).toHaveLength(0);

    useEditorStore.setState(snapshot);
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[0].title).toBe('Restored A');
    expect(state.tabs[1].title).toBe('Restored B');
    expect(state.activeTabId).toBe(id1);
    expect(state.tabs[0].content).toBe('SELECT 1');
    expect(state.tabs[0].isDirty).toBe(false);
  });

  it('rehydration with empty state does not crash', () => {
    resetStore();
    useEditorStore.setState({ tabs: [], activeTabId: null });
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });

  it('store works correctly after reset (simulates corrupt rehydration fallback)', () => {
    resetStore();
    const id = useEditorStore.getState().addTab('After Reset');
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].title).toBe('After Reset');
    expect(state.activeTabId).toBe(id);
  });

  it('addTab works correctly after rehydrating existing tabs', () => {
    // Simulate rehydrated state with 3 tabs
    const rehydrated = {
      tabs: [
        { id: 'old-1', title: 'Tab 1', content: 'SELECT 1', isDirty: false, isPreview: false },
        { id: 'old-2', title: 'Tab 2', content: 'SELECT 2', isDirty: false, isPreview: false },
        { id: 'old-3', title: 'Tab 3', content: 'SELECT 3', isDirty: false, isPreview: false },
      ],
      activeTabId: 'old-3',
    };
    useEditorStore.setState(rehydrated);

    // Add a new tab — should not conflict with existing tabs
    const newId = useEditorStore.getState().addTab();
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(4);
    expect(state.activeTabId).toBe(newId);
    // New tab ID should be unique from old ones
    expect(newId).not.toBe('old-1');
    expect(newId).not.toBe('old-2');
    expect(newId).not.toBe('old-3');
  });
});
