import { create } from "zustand";
import type { SortingState } from "@tanstack/react-table";
import type { QueryResult } from "../types/query";
import { useEditorStore } from "./editorStore";
import { useConnectionStore } from "./connectionStore";

export interface TabDataState {
  tableName: string | null;
  schema: string | null;
  activeWhereClause: string | null;
  tableResult: QueryResult | null;
  totalCount: number;
  approximateCount: number | null;
  page: number;
  pageSize: number;
  sorting: SortingState;
  enumValuesByColumn: Record<string, string[]>;
  fetchedKey: string | null;
  fetchError: string | null;
}

interface TableDataStore {
  tabs: Record<string, TabDataState>;
  getTabData: (tabId: string) => TabDataState;
  setTabData: (tabId: string, data: Partial<TabDataState>) => void;
  resetTabData: (tabId: string) => void;
  clearAll: () => void;
}

export const DEFAULT_TAB_DATA: TabDataState = {
  tableName: null,
  schema: null,
  activeWhereClause: null,
  tableResult: null,
  totalCount: 0,
  approximateCount: null,
  page: 1,
  pageSize: 100,
  sorting: [],
  enumValuesByColumn: {},
  fetchedKey: null,
  fetchError: null,
};

export const useTableDataStore = create<TableDataStore>((set, get) => ({
  tabs: {},
  getTabData: (tabId) => {
    return get().tabs[tabId] || DEFAULT_TAB_DATA;
  },
  setTabData: (tabId, data) => {
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: {
          ...(state.tabs[tabId] || DEFAULT_TAB_DATA),
          ...data,
        },
      },
    }));
  },
  resetTabData: (tabId) => {
    set((state) => {
      const nextTabs = { ...state.tabs };
      delete nextTabs[tabId];
      return { tabs: nextTabs };
    });
  },
  clearAll: () => set({ tabs: {} }),
}));

// Subscribe to editorStore to clean up closed tabs
if (typeof window !== "undefined") {
  useEditorStore.subscribe(
    (state) => state.tabs,
    (tabs) => {
      const activeIds = new Set(tabs.map((t) => t.id));
      const cachedIds = Object.keys(useTableDataStore.getState().tabs);
      for (const id of cachedIds) {
        if (!activeIds.has(id)) {
          useTableDataStore.getState().resetTabData(id);
        }
      }
    },
    { fireImmediately: true }
  );

  let prevConnectionId = useConnectionStore.getState().selectedConnectionId;
  useConnectionStore.subscribe((state) => {
    if (state.selectedConnectionId !== prevConnectionId) {
      prevConnectionId = state.selectedConnectionId;
      useTableDataStore.getState().clearAll();
    }
  });
}
