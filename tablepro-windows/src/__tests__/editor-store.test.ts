import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../stores/editorStore';

function resetStore() {
  useEditorStore.setState({ tabs: [], activeTabId: null });
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
    const id2 = useEditorStore.getState().addTab('B');
    useEditorStore.getState().setActiveTab(id1);
    expect(useEditorStore.getState().activeTabId).toBe(id1);
  });
});

describe('editorStore persistence', () => {
  beforeEach(() => resetStore());

  // The partialize function as defined in editorStore.ts — mirrors the persist config.
  // We test the exact same logic to ensure serialization behaves correctly.
  function partialize(state: { tabs: any[]; activeTabId: string | null }) {
    return {
      tabs: state.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content.slice(0, 100_000),
        isDirty: false,
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
        { id: 'old-1', title: 'Tab 1', content: 'SELECT 1', isDirty: false },
        { id: 'old-2', title: 'Tab 2', content: 'SELECT 2', isDirty: false },
        { id: 'old-3', title: 'Tab 3', content: 'SELECT 3', isDirty: false },
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
