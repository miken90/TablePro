import { describe, it, expect, beforeEach } from "vitest";
import {
  COMMAND_DEFINITIONS,
  getCommandsByCategory,
  getDefaultBinding,
  getEffectiveBinding,
  bindingToKey,
  findBindingConflict,
  getBindingMap,
  useShortcutStore,
  type UserBindings,
} from "../hooks/useCommandRegistry";

// Reset shortcut store between tests
beforeEach(() => {
  useShortcutStore.setState({ userBindings: {} });
});

describe("COMMAND_DEFINITIONS", () => {
  it("every definition has a non-empty id", () => {
    for (const def of COMMAND_DEFINITIONS) {
      expect(def.id).toBeTruthy();
    }
  });

  it("every definition has a non-empty label", () => {
    for (const def of COMMAND_DEFINITIONS) {
      expect(def.label).toBeTruthy();
    }
  });

  it("every definition has a non-empty defaultBinding", () => {
    for (const def of COMMAND_DEFINITIONS) {
      expect(def.defaultBinding.length).toBeGreaterThan(0);
    }
  });

  it("every definition has a valid category", () => {
    const validCategories = ["Navigation", "Query", "Edit", "View", "Settings"];
    for (const def of COMMAND_DEFINITIONS) {
      expect(validCategories).toContain(def.category);
    }
  });

  it("has no duplicate command IDs", () => {
    const ids = COMMAND_DEFINITIONS.map((d) => d.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("has no duplicate default bindings", () => {
    const bindings = COMMAND_DEFINITIONS.map((d) => d.defaultBinding.join("+"));
    const unique = new Set(bindings);
    expect(unique.size).toBe(bindings.length);
  });

  it("uses stable namespaced IDs", () => {
    for (const def of COMMAND_DEFINITIONS) {
      expect(def.id).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
    }
  });
});

describe("getCommandsByCategory", () => {
  it("returns all definitions grouped by category", () => {
    const grouped = getCommandsByCategory();
    const totalInGroups = Object.values(grouped).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(totalInGroups).toBe(COMMAND_DEFINITIONS.length);
  });

  it("includes Navigation commands", () => {
    const grouped = getCommandsByCategory();
    expect(grouped.Navigation.length).toBeGreaterThan(0);
  });
});

describe("getDefaultBinding", () => {
  it("returns binding for a known command", () => {
    const binding = getDefaultBinding("editor.run");
    expect(binding).toEqual(["Ctrl", "Enter"]);
  });

  it("returns undefined for unknown command", () => {
    expect(getDefaultBinding("nonexistent.command")).toBeUndefined();
  });
});

describe("bindingToKey", () => {
  it("normalizes modifier order", () => {
    expect(bindingToKey(["Shift", "Ctrl", "K"])).toBe("ctrl+shift+k");
    expect(bindingToKey(["Ctrl", "Shift", "K"])).toBe("ctrl+shift+k");
  });

  it("is case-insensitive", () => {
    expect(bindingToKey(["ctrl", "enter"])).toBe(bindingToKey(["Ctrl", "Enter"]));
  });

  it("handles single key", () => {
    expect(bindingToKey(["F5"])).toBe("f5");
  });

  it("handles three modifiers", () => {
    expect(bindingToKey(["Ctrl", "Alt", "Shift", "X"])).toBe("ctrl+alt+shift+x");
  });
});

describe("getEffectiveBinding", () => {
  it("returns default when no user override", () => {
    expect(getEffectiveBinding("editor.run")).toEqual(["Ctrl", "Enter"]);
  });

  it("returns user override when set", () => {
    useShortcutStore.getState().setBinding("editor.run", ["Ctrl", "Shift", "Enter"]);
    expect(getEffectiveBinding("editor.run")).toEqual(["Ctrl", "Shift", "Enter"]);
  });

  it("returns default after reset", () => {
    useShortcutStore.getState().setBinding("editor.run", ["Ctrl", "Shift", "Enter"]);
    useShortcutStore.getState().resetBinding("editor.run");
    expect(getEffectiveBinding("editor.run")).toEqual(["Ctrl", "Enter"]);
  });

  it("returns undefined for unknown command", () => {
    expect(getEffectiveBinding("nonexistent.command")).toBeUndefined();
  });
});

describe("findBindingConflict", () => {
  it("returns null when no conflict", () => {
    const result = findBindingConflict("editor.run", ["Ctrl", "Shift", "Y"], {});
    expect(result).toBeNull();
  });

  it("detects conflict with default binding", () => {
    // Ctrl+T is the default for tabs.new
    const result = findBindingConflict("editor.run", ["Ctrl", "T"], {});
    expect(result).toBe("tabs.new");
  });

  it("detects conflict with user override", () => {
    const overrides: UserBindings = { "tabs.new": ["Ctrl", "Shift", "Y"] };
    const result = findBindingConflict("editor.run", ["Ctrl", "Shift", "Y"], overrides);
    expect(result).toBe("tabs.new");
  });

  it("ignores self-conflict", () => {
    const result = findBindingConflict("editor.run", ["Ctrl", "Enter"], {});
    expect(result).toBeNull();
  });

  it("is case-insensitive for conflict detection", () => {
    const result = findBindingConflict("editor.run", ["ctrl", "t"], {});
    expect(result).toBe("tabs.new");
  });
});

describe("getBindingMap", () => {
  it("maps all commands with default bindings", () => {
    const map = getBindingMap({});
    expect(map.size).toBe(COMMAND_DEFINITIONS.length);
  });

  it("reflects user overrides", () => {
    const overrides: UserBindings = { "editor.run": ["Ctrl", "Shift", "R"] };
    const map = getBindingMap(overrides);
    expect(map.get(bindingToKey(["Ctrl", "Shift", "R"]))).toBe("editor.run");
    expect(map.get(bindingToKey(["Ctrl", "Enter"]))).toBeUndefined();
  });
});

describe("useShortcutStore", () => {
  it("starts with empty user bindings", () => {
    expect(Object.keys(useShortcutStore.getState().userBindings)).toHaveLength(0);
  });

  it("setBinding adds a binding", () => {
    useShortcutStore.getState().setBinding("editor.run", ["Ctrl", "R"]);
    expect(useShortcutStore.getState().userBindings["editor.run"]).toEqual(["Ctrl", "R"]);
  });

  it("resetBinding removes a binding", () => {
    useShortcutStore.getState().setBinding("editor.run", ["Ctrl", "R"]);
    useShortcutStore.getState().resetBinding("editor.run");
    expect(useShortcutStore.getState().userBindings["editor.run"]).toBeUndefined();
  });

  it("resetAllBindings clears all", () => {
    useShortcutStore.getState().setBinding("editor.run", ["Ctrl", "R"]);
    useShortcutStore.getState().setBinding("tabs.new", ["Ctrl", "N"]);
    useShortcutStore.getState().resetAllBindings();
    expect(Object.keys(useShortcutStore.getState().userBindings)).toHaveLength(0);
  });
});
