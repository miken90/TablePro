import { describe, expect, it, beforeEach } from "vitest";
import { useDockStore, DOCK_MIN, DOCK_MAX, DOCK_DEFAULT_WIDTHS, mergeDockWidths } from "./dock-store";

function resetDockStore() {
  useDockStore.setState({
    dockOpen: true,
    dockPane: "inspector",
    dockWidths: { ...DOCK_DEFAULT_WIDTHS },
  });
}

describe("useDockStore", () => {
  beforeEach(resetDockStore);

  it("defaults to open on inspector with the Q3 widths", () => {
    const s = useDockStore.getState();
    expect(s.dockOpen).toBe(true);
    expect(s.dockPane).toBe("inspector");
    expect(s.dockWidths).toEqual({ inspector: 280, history: 360, ai: 400 });
  });

  it("toggleDockPane opens a closed dock on the requested pane", () => {
    useDockStore.setState({ dockOpen: false });
    useDockStore.getState().toggleDockPane("history");
    expect(useDockStore.getState().dockOpen).toBe(true);
    expect(useDockStore.getState().dockPane).toBe("history");
  });

  it("toggleDockPane closes the dock when the same pane is already open", () => {
    useDockStore.setState({ dockOpen: true, dockPane: "history" });
    useDockStore.getState().toggleDockPane("history");
    expect(useDockStore.getState().dockOpen).toBe(false);
    // The pane selection itself is left alone; only visibility flips.
    expect(useDockStore.getState().dockPane).toBe("history");
  });

  it("toggleDockPane while open on a different pane switches and stays open", () => {
    useDockStore.setState({ dockOpen: true, dockPane: "history" });
    useDockStore.getState().toggleDockPane("ai");
    expect(useDockStore.getState().dockOpen).toBe(true);
    expect(useDockStore.getState().dockPane).toBe("ai");
  });

  it("setDockWidth clamps above the max", () => {
    useDockStore.getState().setDockWidth("ai", 900);
    expect(useDockStore.getState().dockWidths.ai).toBe(DOCK_MAX);
  });

  it("setDockWidth clamps below the min", () => {
    useDockStore.getState().setDockWidth("inspector", 100);
    expect(useDockStore.getState().dockWidths.inspector).toBe(DOCK_MIN);
  });

  it("widths for each pane are independent", () => {
    useDockStore.getState().setDockWidth("history", 500);
    expect(useDockStore.getState().dockWidths).toEqual({
      inspector: 280,
      history: 500,
      ai: 400,
    });
  });

  it("closeDock closes regardless of the active pane", () => {
    useDockStore.setState({ dockOpen: true, dockPane: "ai" });
    useDockStore.getState().closeDock();
    expect(useDockStore.getState().dockOpen).toBe(false);
  });
});

describe("mergeDockWidths [RT-13]", () => {
  it("clamps a stale or hand-edited persisted width at rehydration", () => {
    const merged = mergeDockWidths(
      { inspector: 50, history: 9999, ai: 400 },
      { ...DOCK_DEFAULT_WIDTHS },
    );
    expect(merged).toEqual({ inspector: DOCK_MIN, history: DOCK_MAX, ai: 400 });
  });

  it("falls back to the current width when the persisted value is not a finite number", () => {
    const merged = mergeDockWidths(
      { inspector: "not-a-number", history: null, ai: undefined },
      { ...DOCK_DEFAULT_WIDTHS },
    );
    expect(merged).toEqual({ ...DOCK_DEFAULT_WIDTHS });
  });

  it("leaves a well-formed persisted width untouched", () => {
    const merged = mergeDockWidths({ inspector: 320 }, { ...DOCK_DEFAULT_WIDTHS });
    expect(merged).toEqual({ inspector: 320, history: 360, ai: 400 });
  });
});
