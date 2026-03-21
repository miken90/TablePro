import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ColumnInfo } from "../types/query";

export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 480;
export const EDITOR_MIN_PERCENT = 20;
export const INSPECTOR_DEFAULT = 300;
export const INSPECTOR_MIN = 200;
export const INSPECTOR_MAX = 500;

interface TableReference {
  tableName: string;
  schema?: string | null;
}

type ViewMode = "query" | "table-browse";

interface LayoutState {
  // Sidebar
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // Editor
  editorHeightPercent: number;

  // Inspector
  inspectorVisible: boolean;
  inspectorWidth: number;

  // Panels
  historyVisible: boolean;
  filterVisible: boolean;

  // Overlays
  quickSwitcherOpen: boolean;
  settingsOpen: boolean;
  helpOpen: boolean;
  commandPaletteOpen: boolean;

  // View mode
  viewMode: ViewMode;
  activeTableContext: TableReference | null;
  structureTarget: TableReference | null;

  // Filter columns (derived from active table)
  filterColumns: ColumnInfo[];

  // Inspector row selection
  selectedRowIndex: number | null;

  // Actions
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  setEditorHeightPercent: (pct: number) => void;
  toggleInspector: () => void;
  setInspectorWidth: (w: number) => void;
  toggleHistory: () => void;
  toggleFilter: () => void;
  setQuickSwitcherOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openTable: (tableName: string, schema?: string | null) => void;
  openStructure: (tableName: string, schema?: string | null) => void;
  switchToQueryMode: () => void;
  closeStructure: () => void;
  setFilterColumns: (cols: ColumnInfo[]) => void;
  setSelectedRowIndex: (index: number | null) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT,
      sidebarCollapsed: false,
      editorHeightPercent: 50,
      inspectorVisible: false,
      inspectorWidth: INSPECTOR_DEFAULT,
      historyVisible: false,
      filterVisible: false,
      quickSwitcherOpen: false,
      settingsOpen: false,
      helpOpen: false,
      commandPaletteOpen: false,
      viewMode: "query",
      activeTableContext: null,
      structureTarget: null,
      filterColumns: [],
      selectedRowIndex: null,

      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setEditorHeightPercent: (pct) => set({ editorHeightPercent: pct }),
      toggleInspector: () => set((s) => ({ inspectorVisible: !s.inspectorVisible })),
      setInspectorWidth: (w) => set({ inspectorWidth: w }),
      toggleHistory: () => set((s) => ({ historyVisible: !s.historyVisible })),
      toggleFilter: () => set((s) => ({ filterVisible: !s.filterVisible })),
      setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setHelpOpen: (open) => set({ helpOpen: open }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      openTable: (tableName, schema) =>
        set({
          activeTableContext: { tableName, schema },
          viewMode: "table-browse",
          structureTarget: null,
        }),
      openStructure: (tableName, schema) =>
        set({ structureTarget: { tableName, schema } }),
      switchToQueryMode: () =>
        set({ viewMode: "query", activeTableContext: null }),
      closeStructure: () => set({ structureTarget: null }),
      setFilterColumns: (cols) => set({ filterColumns: cols }),
      setSelectedRowIndex: (index) => set({ selectedRowIndex: index }),
    }),
    {
      name: "tablepro-layout",
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
