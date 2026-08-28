import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ColumnInfo } from "../types/query";
import type { PaletteMode } from "../components/palette/palette-modes";

export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 480;
export const EDITOR_MIN_PERCENT = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSidebarWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SIDEBAR_DEFAULT;
  }

  return clamp(value, SIDEBAR_MIN, SIDEBAR_MAX);
}

interface LayoutState {
  // Sidebar
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // Editor
  editorHeightPercent: number;

  // Panels
  filterVisible: boolean;

  // Overlays
  /** M5: the unified palette (SCR-52 objects / SCR-53 commands). Neither
   *  flag is persisted — a reload never reopens it. */
  paletteOpen: boolean;
  paletteSeedMode: PaletteMode;
  settingsOpen: boolean;
  helpOpen: boolean;
  /** SQL file import dialog (opened by the `data.importSql` command). */
  importOpen: boolean;
  /** About box (opened by the `app.about` command). */
  aboutOpen: boolean;

  // Filter columns (derived from the active table tab)
  filterColumns: ColumnInfo[];

  // Inspector row selection
  selectedRowIndex: number | null;

  // Actions
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  setEditorHeightPercent: (pct: number) => void;
  toggleFilter: () => void;
  /** Opens the palette seeded to `mode`, or closes it if already open on that mode. */
  openPalette: (mode: PaletteMode) => void;
  closePalette: () => void;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
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
      filterVisible: false,
      paletteOpen: false,
      paletteSeedMode: "objects",
      settingsOpen: false,
      helpOpen: false,
      importOpen: false,
      aboutOpen: false,
      filterColumns: [],
      selectedRowIndex: null,

      setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_MIN, SIDEBAR_MAX) }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setEditorHeightPercent: (pct) =>
        set({ editorHeightPercent: clamp(pct, EDITOR_MIN_PERCENT, 80) }),
      toggleFilter: () => set((s) => ({ filterVisible: !s.filterVisible })),
      openPalette: (mode) =>
        set((s) => {
          if (s.paletteOpen && s.paletteSeedMode === mode) return { paletteOpen: false };
          return { paletteOpen: true, paletteSeedMode: mode };
        }),
      closePalette: () => set({ paletteOpen: false }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setHelpOpen: (open) => set({ helpOpen: open }),
      setImportOpen: (open) => set({ importOpen: open }),
      setAboutOpen: (open) => set({ aboutOpen: open }),
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
