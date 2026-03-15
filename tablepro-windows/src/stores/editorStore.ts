import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface EditorTab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;

  // Actions
  addTab: (title?: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  renameTab: (id: string, title: string) => void;
}

let tabCounter = 1;

function generateTabId(): string {
  return `tab-${Date.now()}-${tabCounter++}`;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      addTab: (title) => {
        const id = generateTabId();
        const newTab: EditorTab = {
          id,
          title: title ?? `Query ${get().tabs.length + 1}`,
          content: "",
          isDirty: false,
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
        return id;
      },

      closeTab: (id) => {
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          let activeTabId = s.activeTabId;
          if (activeTabId === id) {
            const idx = s.tabs.findIndex((t) => t.id === id);
            activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
          }
          return { tabs, activeTabId };
        });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTabContent: (id, content) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, content, isDirty: true } : t)),
        }));
      },

      renameTab: (id, title) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
        }));
      },
    }),
    {
      name: "tablepro-editor-tabs",
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          content: t.content.slice(0, 100_000),
          isDirty: false,
        })),
        activeTabId: state.activeTabId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.tabs.length) {
          tabCounter = state.tabs.length + 1;
        }
      },
    }
  )
);
