import { describe, it, expect } from "vitest";
import {
  materializeRows,
  readCell,
  isExplainResult,
  truncateCell,
  explainColumnWidth,
  RENDER_ROW_CAP,
  EXPLAIN_COL_MAX_PX,
} from "./columnar-render";
import type {
  ColumnDataWire,
  ColumnarResultWire,
} from "../../stores/queryResultStore";

function mkColumnar(
  rowCount: number,
  data: ColumnDataWire[],
  columns: { name: string }[],
): ColumnarResultWire {
  return {
    columns: columns.map((c) => ({
      name: c.name,
      typeName: "text",
      nullable: true,
      isPrimaryKey: false,
    })),
    data,
    row_count: rowCount,
  };
}

describe("materializeRows", () => {
  it("respects 500 cap", () => {
    const values = Array.from({ length: 1000 }, (_, i) => `r${i}`);
    const cr = mkColumnar(
      1000,
      [{ kind: "Strings", values }],
      [{ name: "a" }],
    );
    const rows = materializeRows(cr);
    expect(rows.length).toBe(RENDER_ROW_CAP);
    expect(rows[0]).toEqual(["r0"]);
    expect(rows[499]).toEqual(["r499"]);
  });

  it("returns [] for null input", () => {
    expect(materializeRows(null)).toEqual([]);
  });

  it("reads correct cells across mixed types", () => {
    const cr = mkColumnar(
      3,
      [
        { kind: "Ints", values: [1, 2, 3] },
        { kind: "Strings", values: ["a", "b", null] },
        { kind: "Bools", values: [true, false, null] },
      ],
      [{ name: "i" }, { name: "s" }, { name: "b" }],
    );
    const rows = materializeRows(cr);
    expect(rows).toEqual([
      [1, "a", true],
      [2, "b", false],
      [3, null, null],
    ]);
  });

  it("respects custom max smaller than row_count", () => {
    const cr = mkColumnar(
      10,
      [{ kind: "Ints", values: Array.from({ length: 10 }, (_, i) => i) }],
      [{ name: "a" }],
    );
    expect(materializeRows(cr, 4).length).toBe(4);
  });
});

describe("readCell", () => {
  it("returns null for Null kind regardless of index", () => {
    const col: ColumnDataWire = { kind: "Null", values: 5 };
    expect(readCell(col, 0)).toBeNull();
    expect(readCell(col, 99)).toBeNull();
  });
});

describe("isExplainResult", () => {
  it("true for single QUERY PLAN col", () => {
    expect(isExplainResult([{ name: "QUERY PLAN" }])).toBe(true);
  });
  it("false for multiple cols including QUERY PLAN", () => {
    expect(isExplainResult([{ name: "QUERY PLAN" }, { name: "x" }])).toBe(
      false,
    );
  });
  it("false for single col with different name", () => {
    expect(isExplainResult([{ name: "id" }])).toBe(false);
  });
  it("false for null/undefined/empty", () => {
    expect(isExplainResult(null)).toBe(false);
    expect(isExplainResult(undefined)).toBe(false);
    expect(isExplainResult([])).toBe(false);
  });
});

describe("truncateCell", () => {
  it("returns empty string for null/undefined", () => {
    expect(truncateCell(null)).toBe("");
    expect(truncateCell(undefined)).toBe("");
  });

  it("trims at 80 chars with ellipsis", () => {
    const long = "x".repeat(120);
    const out = truncateCell(long);
    // 77 chars + "…" = 78 total; under the 80-char display limit
    expect(out.length).toBe(78);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, 77)).toBe("x".repeat(77));
  });

  it("does not trim strings <= 80 chars", () => {
    const exact = "a".repeat(80);
    expect(truncateCell(exact)).toBe(exact);
  });

  it("skips trim when isExplain=true", () => {
    const long = "y".repeat(500);
    expect(truncateCell(long, true)).toBe(long);
  });

  it("JSON-stringifies non-string values", () => {
    expect(truncateCell({ a: 1 })).toBe('{"a":1}');
    expect(truncateCell(42)).toBe("42");
  });
});

describe("explainColumnWidth", () => {
  it("caps at 4000px for very long rows", () => {
    const rows = [["x".repeat(10000)]];
    expect(explainColumnWidth(rows)).toBe(EXPLAIN_COL_MAX_PX);
  });

  it("scales with longest row", () => {
    const rows = [["abc"], ["abcdefghij"]];
    // 10 chars * 7 + 24 = 94
    expect(explainColumnWidth(rows)).toBe(94);
  });

  it("handles empty rows", () => {
    expect(explainColumnWidth([])).toBe(24);
  });
});
