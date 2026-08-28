import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DockPane = "inspector" | "history" | "ai";

export const DOCK_MIN = 280;
export const DOCK_MAX = 520;

/** Per-pane default widths (Q3): inspector 280 / history 360 / ai 400. */
export const DOCK_DEFAULT_WIDTHS: Record<DockPane, number> = {
  inspector: 280,
  history: 360,
  ai: 400,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampWidth(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, DOCK_MIN, DOCK_MAX)
    : fallback;
}

/**
 * [RT-13] Reconcile a persisted `dockWidths` blob with the live defaults: a
 * stale or hand-edited entry must never rehydrate a width outside 280..520,
 * and a missing/malformed pane falls back to the current (in-memory) width.
 * Exported as a pure function so the clamp is testable without touching the
 * persist middleware's internals.
 */
export function mergeDockWidths(
  persisted: Partial<Record<DockPane, unknown>> | undefined,
  current: Record<DockPane, number>,
): Record<DockPane, number> {
  const merged = { ...current };
  (Object.keys(merged) as DockPane[]).forEach((pane) => {
    merged[pane] = clampWidth(persisted?.[pane], merged[pane]);
  });
  return merged;
}

interface DockState {
  /** Whether the dock column is shown at all. Defaults `true`, matching
   *  today's `inspectorVisible: true` — the dock replaces the tab-kind-scoped
   *  auto-hide/restore behaviour with a single flat toggle (Risk Assessment). */
  dockOpen: boolean;
  dockPane: DockPane;
  dockWidths: Record<DockPane, number>;
  /** Opens the dock on `pane`, or closes it if `pane` is already the open one. */
  toggleDockPane: (pane: DockPane) => void;
  setDockPane: (pane: DockPane) => void;
  setDockWidth: (pane: DockPane, width: number) => void;
  closeDock: () => void;
}

export const useDockStore = create<DockState>()(
  persist(
    (set) => ({
      dockOpen: true,
      dockPane: "inspector",
      dockWidths: { ...DOCK_DEFAULT_WIDTHS },

      toggleDockPane: (pane) =>
        set((s) => {
          if (s.dockOpen && s.dockPane === pane) return { dockOpen: false };
          return { dockOpen: true, dockPane: pane };
        }),
      setDockPane: (pane) => set({ dockPane: pane }),
      setDockWidth: (pane, width) =>
        set((s) => ({
          dockWidths: { ...s.dockWidths, [pane]: clamp(width, DOCK_MIN, DOCK_MAX) },
        })),
      closeDock: () => set({ dockOpen: false }),
    }),
    {
      name: "tablepro-dock",
      partialize: (state) => ({ dockWidths: state.dockWidths }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        dockWidths: mergeDockWidths(
          (persistedState as { dockWidths?: Partial<Record<DockPane, unknown>> } | undefined)?.dockWidths,
          currentState.dockWidths,
        ),
      }),
    },
  ),
);
