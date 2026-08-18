import { describe, it, expect } from "vitest";
import {
  isExplainResult,
  truncateForRender,
  explainColumnWidth,
  CELL_RENDER_LIMIT,
  EXPLAIN_COL_MAX_PX,
} from "./columnar-render";

describe("isExplainResult", () => {
  it("detects the single QUERY PLAN column", () => {
    expect(isExplainResult([{ name: "QUERY PLAN" }])).toBe(true);
  });
  it("rejects multi-column results", () => {
    expect(isExplainResult([{ name: "QUERY PLAN" }, { name: "x" }])).toBe(false);
  });
  it("rejects a differently named single column", () => {
    expect(isExplainResult([{ name: "id" }])).toBe(false);
  });
  it("handles null/undefined/empty", () => {
    expect(isExplainResult(null)).toBe(false);
    expect(isExplainResult(undefined)).toBe(false);
    expect(isExplainResult([])).toBe(false);
  });
});

describe("truncateForRender", () => {
  it("slices values past the limit and marks them", () => {
    const long = "x".repeat(CELL_RENDER_LIMIT + 50);
    const out = truncateForRender(long);
    expect(out.length).toBe(CELL_RENDER_LIMIT + 1);
    expect(out.endsWith("…")).toBe(true);
  });

  // Control: values at or under the limit must come back byte-identical, so
  // an unconditional slice fails here.
  it("returns short values unchanged", () => {
    expect(truncateForRender("abc")).toBe("abc");
    const exact = "y".repeat(CELL_RENDER_LIMIT);
    expect(truncateForRender(exact)).toBe(exact);
  });

  it("honours an explicit limit", () => {
    expect(truncateForRender("abcdef", 3)).toBe("abc…");
  });
});

describe("explainColumnWidth", () => {
  it("caps at the maximum pixel width", () => {
    const rows = [["z".repeat(10_000)]];
    expect(explainColumnWidth(rows)).toBe(EXPLAIN_COL_MAX_PX);
  });

  it("sizes to the longest row", () => {
    const rows = [["abc"], ["abcdefghij"]];
    expect(explainColumnWidth(rows)).toBe(94);
  });

  it("returns the padding-only width for no rows", () => {
    expect(explainColumnWidth([])).toBe(24);
  });
});
