import { describe, expect, it } from "vitest";
import { parsePaletteInput, buildObjectResults, KIND_ORDER } from "./palette-modes";
import type { TableInfo } from "../../types/schema";
import type { HistoryEntry } from "../../stores/history";

describe("parsePaletteInput", () => {
  it("a bare query stays objects mode", () => {
    expect(parsePaletteInput("users")).toEqual({ mode: "objects", query: "users" });
  });

  it("a leading > switches to commands mode", () => {
    expect(parsePaletteInput(">run")).toEqual({ mode: "commands", query: "run" });
  });

  it("a lone > with nothing after it is commands mode with an empty query", () => {
    expect(parsePaletteInput("  >")).toEqual({ mode: "commands", query: "" });
  });

  it("a > that does not lead stays objects mode, literally", () => {
    expect(parsePaletteInput("a > b")).toEqual({ mode: "objects", query: "a > b" });
  });
});

describe("buildObjectResults", () => {
  const table = (name: string, schema: string | null = "public", tableType = "table"): TableInfo =>
    ({ name, schema, tableType }) as TableInfo;
  const entry = (id: number, query: string): HistoryEntry => ({
    id,
    query,
    database: null,
    execution_time_ms: 1,
    row_count: 0,
    status: "success",
    timestamp: new Date().toISOString(),
  });

  it("groups results in KIND_ORDER, dropping empty kinds", () => {
    const groups = buildObjectResults({
      tables: [table("users")],
      databases: ["app"],
      schemas: [],
      historyEntries: [],
      isDocumentDb: false,
      currentSchema: null,
      query: "",
    });
    expect(groups.map((g) => g.kind)).toEqual(["table", "database"]);
    expect(KIND_ORDER.indexOf("table")).toBeLessThan(KIND_ORDER.indexOf("database"));
  });

  it("a view surfaces under the view kind, not table", () => {
    const groups = buildObjectResults({
      tables: [table("v_active_users", "public", "VIEW")],
      databases: [],
      schemas: [],
      historyEntries: [],
      isDocumentDb: false,
      currentSchema: null,
      query: "",
    });
    expect(groups[0].kind).toBe("view");
  });

  it("a document-db table always surfaces as a collection", () => {
    const groups = buildObjectResults({
      tables: [table("orders")],
      databases: [],
      schemas: [],
      historyEntries: [],
      isDocumentDb: true,
      currentSchema: null,
      query: "",
    });
    expect(groups[0].kind).toBe("collection");
  });

  it("a query that scores 0 on every table is dropped, not zero-scored", () => {
    const groups = buildObjectResults({
      tables: [table("orders")],
      databases: [],
      schemas: [],
      historyEntries: [],
      isDocumentDb: false,
      currentSchema: null,
      query: "zzz",
    });
    expect(groups).toEqual([]);
  });

  it("recent queries are capped at 20 and truncated for display", () => {
    const longSql = "select " + "a".repeat(200);
    const entries = Array.from({ length: 25 }, (_, i) => entry(i, `select ${i}`));
    entries[0] = entry(0, longSql);
    const groups = buildObjectResults({
      tables: [],
      databases: [],
      schemas: [],
      historyEntries: entries,
      isDocumentDb: false,
      currentSchema: null,
      query: "",
    });
    const queryGroup = groups.find((g) => g.kind === "query")!;
    expect(queryGroup.items).toHaveLength(20);
    expect(queryGroup.items[0].label.length).toBeLessThanOrEqual(83);
  });

  it("the active schema is marked in its subtitle", () => {
    const groups = buildObjectResults({
      tables: [],
      databases: [],
      schemas: ["public", "app"],
      historyEntries: [],
      isDocumentDb: false,
      currentSchema: "app",
      query: "",
    });
    const schemaGroup = groups.find((g) => g.kind === "schema")!;
    expect(schemaGroup.items.find((i) => i.label === "app")?.subtitle).toBe("active");
    expect(schemaGroup.items.find((i) => i.label === "public")?.subtitle).toBeUndefined();
  });
});
