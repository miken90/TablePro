import { describe, expect, it } from "vitest";
import { estimatePayloadBytes } from "./local-metrics";

function rows(n: number, cellLength: number): (string | null)[][] {
  return Array.from({ length: n }, () => ["x".repeat(cellLength)]);
}

describe("estimatePayloadBytes", () => {
  it("extrapolates from the sample to the full result", () => {
    // 200 identical rows, but only 100 are sampled: the estimate must still
    // describe all 200.
    const sample = rows(200, 10);
    const { bytes, bytesSampled } = estimatePayloadBytes(sample, 200);
    expect(bytesSampled).toBe(100);
    const oneRow = JSON.stringify(sample[0]).length;
    expect(bytes).toBe(oneRow * 200);
  });

  it("reports the sample size it actually used", () => {
    const { bytesSampled } = estimatePayloadBytes(rows(7, 4), 7);
    expect(bytesSampled).toBe(7);
  });

  it("returns zero for an empty result instead of dividing by zero", () => {
    expect(estimatePayloadBytes([], 0)).toEqual({ bytes: 0, bytesSampled: 0 });
  });

  // Control: a wider row must produce a larger estimate, so a hardcoded
  // constant fails here.
  it("scales with row width", () => {
    const narrow = estimatePayloadBytes(rows(10, 5), 10).bytes;
    const wide = estimatePayloadBytes(rows(10, 500), 10).bytes;
    expect(wide).toBeGreaterThan(narrow * 10);
  });
});
