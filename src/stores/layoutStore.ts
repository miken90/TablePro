import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ColumnInfo } from "../types/query";
import { useEditorStore, type TabType } from "./editorStore";

export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 480;
export const EDITOR_MIN_PERCENT = 20;
export const INSPECTOR_DEFAULT = 280;
export const INSPECTOR_MIN = 200;
export const INSPECTOR_MAX = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSidebarWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SIDEBAR_DEFAULT;
  }

  return clamp(value, SIDEBAR_MIN, SIDEBAR_MAX);
}

/** Kind of the active editor tab, read without a store subscription. */
function activeTabKind(): TabType {
  const editor = useEditorStore.getState();
  return editor.tabs.find((t) => t.id === editor.activeTabId)?.type ?? "query";
}

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
  aiChatVisible: boolean;

  // Overlays
  quickSwitcherOpen: boolean;
  settingsOpen: boolean;
  helpOpen: boolean;
  commandPaletteOpen: boolean;
  /** SQL file import dialog (opened by the `data.importSql` command). */
  importOpen: boolean;
  /** About box (opened by the `app.about` command). */
  aboutOpen: boolean;

  // Filter columns (derived from the active table tab)
  filterColumns: ColumnInfo[];

  // Inspector row selection
  selectedRowIndex: number | null;

  // Query inspector preference
  queryInspectorVisible: boolean;
  queryInspectorPreferenceSet: boolean;

  // Actions
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  setEditorHeightPercent: (pct: number) => void;
  toggleInspector: () => void;
  setInspectorWidth: (w: number) => void;
  toggleHistory: () => void;
  toggleFilter: () => void;
  toggleAiChat: () => void;
  setQuickSwitcherOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  /**
   * Apply the inspector rule for a tab kind: a table tab hides the inspector
   * (the grid owns the row detail); a structure tab leaves it alone; every
   * editor kind restores the remembered query-tab preference. Called by
   * `syncActiveTabContext` on every activation.
   */
  syncInspectorForTabKind: (kind: TabType) => void;
  setFilterColumns: (cols: ColumnInfo[]) => void;
  setSelectedRowIndex: (index: number | null) => void;

  // Grid row selection count (for contextual bar delete button)
  selectedRowCount: number;
  setSelectedRowCount: (count: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT,
      sidebarCollapsed: false,
      editorHeightPercent: 45,
      inspectorVisible: true,
      inspectorWidth: INSPECTOR_DEFAULT,
      historyVisible: false,
      filterVisible: false,
      aiChatVisible: false,
      quickSwitcherOpen: false,
      settingsOpen: false,
      helpOpen: false,
      commandPaletteOpen: false,
      importOpen: false,
      aboutOpen: false,
      filterColumns: [],
      selectedRowIndex: null,
      queryInspectorVisible: true,
      queryInspectorPreferenceSet: false,

      setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_MIN, SIDEBAR_MAX) }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setEditorHeightPercent: (pct) =>
        set({ editorHeightPercent: clamp(pct, EDITOR_MIN_PERCENT, 80) }),
      toggleInspector: () =>
        set((s) => {
          const nextInspectorVisible = !s.inspectorVisible;
          if (activeTabKind() !== "table") {
            return {
              inspectorVisible: nextInspectorVisible,
              queryInspectorVisible: nextInspectorVisible,
              queryInspectorPreferenceSet: true,
            };
          }

          return { inspectorVisible: nextInspectorVisible };
        }),
      setInspectorWidth: (w) => set({ inspectorWidth: clamp(w, INSPECTOR_MIN, INSPECTOR_MAX) }),
      toggleHistory: () => set((s) => ({ historyVisible: !s.historyVisible })),
      toggleFilter: () => set((s) => ({ filterVisible: !s.filterVisible })),
      toggleAiChat: () => set((s) => ({ aiChatVisible: !s.aiChatVisible })),
      setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setHelpOpen: (open) => set({ helpOpen: open }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setImportOpen: (open) => set({ importOpen: open }),
      setAboutOpen: (open) => set({ aboutOpen: open }),
      syncInspectorForTabKind: (kind) =>
        set((state) => {
          if (kind === "table") return { inspectorVisible: false };
          // Looking at a structure is neither a grid nor an editor: leave the
          // inspector as it is and record no preference (the old takeover
          // never touched it either).
          if (kind === "structure") return {};
          const remembered = state.queryInspectorPreferenceSet ? state.queryInspectorVisible : true;
          return {
            inspectorVisible: remembered,
            queryInspectorVisible: remembered,
            queryInspectorPreferenceSet: true,
          };
        }),
      setFilterColumns: (cols) => set({ filterColumns: cols }),
      setSelectedRowIndex: (index) => set({ selectedRowIndex: index }),
      selectedRowCount: 0,
      setSelectedRowCount: (count) => set({ selectedRowCount: count }),
    }),
    {
      name: "tablepro-layout",
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<LayoutState>),
        };

        return {
          ...merged,
          sidebarWidth: clampSidebarWidth(merged.sidebarWidth),
        };
      },
    },
  ),
);
