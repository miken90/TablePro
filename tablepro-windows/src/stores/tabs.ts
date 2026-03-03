import { create } from "zustand";
import type { QueryTab } from "../types";

interface TabState {
  tabs: QueryTab[];
  activeTabId: string | null;

  addTab: (connectionId: string, database: string | null) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabQuery: (id: string, query: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  closeAllTabs: () => void;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (connectionId, database) => {
    const id = crypto.randomUUID();
    const tabNum = get().tabs.length + 1;
    const tab: QueryTab = {
      id,
      title: `Query ${tabNum}`,
      query: "",
      connectionId,
      database,
      isDirty: false,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
    }));
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

  updateTabQuery: (id, query) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, query, isDirty: true } : t)),
    }));
  },

  updateTabTitle: (id, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),
}));
