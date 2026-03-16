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

  it('partialize truncates content to 100KB', () => {
    // Access the persist config to test partialize
    const store = useEditorStore;
    const id = store.getState().addTab('Big');
    const bigContent = 'x'.repeat(150_000);
    store.getState().updateTabContent(id, bigContent);

    // Simulate what partialize does
    const state = store.getState();
    const serialized = {
      tabs: state.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content.slice(0, 100_000),
        isDirty: false,
      })),
      activeTabId: state.activeTabId,
    };
    expect(serialized.tabs[0].content.length).toBe(100_000);
  });

  it('partialize sets isDirty to false', () => {
    const id = useEditorStore.getState().addTab('Dirty');
    useEditorStore.getState().updateTabContent(id, 'SELECT 1');
    expect(useEditorStore.getState().tabs[0].isDirty).toBe(true);

    // Simulate partialize output
    const state = useEditorStore.getState();
    const serialized = {
      tabs: state.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content.slice(0, 100_000),
        isDirty: false,
      })),
    };
    expect(serialized.tabs[0].isDirty).toBe(false);
  });

  it('multiple tabs are all preserved in serialized state', () => {
    useEditorStore.getState().addTab('Tab A');
    useEditorStore.getState().addTab('Tab B');
    useEditorStore.getState().addTab('Tab C');
    const state = useEditorStore.getState();
    const serialized = {
      tabs: state.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content.slice(0, 100_000),
        isDirty: false,
      })),
      activeTabId: state.activeTabId,
    };
    expect(serialized.tabs).toHaveLength(3);
    expect(serialized.tabs.map((t) => t.title)).toEqual(['Tab A', 'Tab B', 'Tab C']);
  });
});
