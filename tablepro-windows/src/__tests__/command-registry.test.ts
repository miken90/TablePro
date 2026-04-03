import { describe, it, expect } from "vitest";
import {
  COMMAND_DEFINITIONS,
  getCommandsByCategory,
  getDefaultBinding,
} from "../hooks/useCommandRegistry";

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
