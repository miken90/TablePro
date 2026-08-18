import { describe, it, expect, beforeEach } from "vitest";
import {
  useQueryResultStore,
  type QueryChunk,
  type ColumnarResultWire,
  type ColumnDataWire,
} from "./queryResultStore";
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";
import type { ColumnInfo } from "../types/query";

const COLS: ColumnInfo[] = [
  { name: "id", typeName: "int8", nullable: false, isPrimaryKey: true },
  { name: "name", typeName: "text", nullable: true, isPrimaryKey: false },
];

function ints(n: number, offset = 0): ColumnDataWire {
  return { kind: "Ints", values: Array.from({ length: n }, (_, i) => i + offset) };
}

function strings(n: number, offset = 0): ColumnDataWire {
  return {
    kind: "Strings",
    values: Array.from({ length: n }, (_, i) => `v${i + offset}`),
  };
}

function rowsChunk(n: number, gen: number, idx = 0, offset = 0): QueryChunk {
  const chunk: ColumnarResultWire = {
    columns: COLS,
    data: [ints(n, offset), strings(n, offset)],
    row_count: n,
  };
  return { kind: "rows", idx, chunk, generation: gen };
}

function metaChunk(gen: number, totalEstimate = 100): QueryChunk {
  return { kind: "meta", columns: COLS, totalEstimate, generation: gen };
}

function resetStores(storeMaxRows = 100) {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, storeMaxRows },
    isLoaded: true,
  });
  useQueryResultStore.getState().clearStream();
}

describe("queryResultStore", () => {
  beforeEach(() => resetStores());

  it("beginStream resets prior streaming state", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1, 250));
    s.appendChunk(rowsChunk(10, 1));
    s.appendChunk({ kind: "err", message: "bang", generation: 1 });

    s.beginStream(2);
    const next = useQueryResultStore.getState();
    expect(next.generation).toBe(2);
    expect(next.columnar).toBeNull();
    expect(next.totalRowsServer).toBe(0);
    expect(next.truncated).toBe(false);
    expect(next.streaming).toBe(true);
    expect(next.streamError).toBeNull();
    expect(next.durationMs).toBeNull();
  });

  it("appendChunk meta sets columns + totalEstimate", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1, 4242));
    const st = useQueryResultStore.getState();
    expect(st.totalRowsServer).toBe(4242);
    expect(st.columnar).not.toBeNull();
    expect(st.columnar!.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(st.columnar!.row_count).toBe(0);
  });

  it("appendChunk rows accumulates row_count under cap", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1, 50));
    s.appendChunk(rowsChunk(20, 1, 0, 0));
    s.appendChunk(rowsChunk(20, 1, 1, 20));
    const st = useQueryResultStore.getState();
    expect(st.columnar!.row_count).toBe(40);
    expect(st.truncated).toBe(false);
    // Values concatenated in order.
    const ids = (st.columnar!.data[0] as { values: (number | null)[] }).values;
    expect(ids[0]).toBe(0);
    expect(ids[39]).toBe(39);
  });

  it("caps at storeMaxRows: trims and sets truncated", () => {
    resetStores(100);
    const s = useQueryResultStore.getState();
    s.beginStream(7);
    s.appendChunk(metaChunk(7, 250));
    s.appendChunk(rowsChunk(80, 7, 0, 0)); // 80 stored
    s.appendChunk(rowsChunk(80, 7, 1, 80)); // → 100, 60 dropped, truncated
    s.appendChunk(rowsChunk(80, 7, 2, 160)); // dropped entirely
    const st = useQueryResultStore.getState();
    expect(st.columnar!.row_count).toBe(100);
    expect(st.truncated).toBe(true);
    const ids = (st.columnar!.data[0] as { values: (number | null)[] }).values;
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe(0);
    expect(ids[99]).toBe(99); // second chunk contributed only first 20 rows
  });

  it("chunks beyond cap are dropped (row_count stays at cap)", () => {
    resetStores(50);
    const s = useQueryResultStore.getState();
    s.beginStream(3);
    s.appendChunk(metaChunk(3, 1000));
    s.appendChunk(rowsChunk(50, 3, 0, 0));
    expect(useQueryResultStore.getState().truncated).toBe(false); // exactly at cap is not truncated yet — needs an attempted overflow
    s.appendChunk(rowsChunk(10, 3, 1, 50));
    expect(useQueryResultStore.getState().truncated).toBe(true);
    s.appendChunk(rowsChunk(10, 3, 2, 60));
    s.appendChunk(rowsChunk(10, 3, 3, 70));
    const st = useQueryResultStore.getState();
    expect(st.columnar!.row_count).toBe(50);
    expect(st.truncated).toBe(true);
  });

  it("done flips streaming=false and records durationMs", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1));
    s.appendChunk({ kind: "done", rowsTotal: 0, ms: 42, generation: 1, truncated: false, totalRows: 0 });
    const st = useQueryResultStore.getState();
    expect(st.streaming).toBe(false);
    expect(st.durationMs).toBe(42);
  });

  it("done reporting backend truncation sets truncated + the real total", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1, 200_000));
    s.appendChunk(rowsChunk(10, 1));
    s.appendChunk({
      kind: "done",
      rowsTotal: 10,
      ms: 5,
      generation: 1,
      truncated: true,
      totalRows: 200_000,
    });
    const st = useQueryResultStore.getState();
    expect(st.truncated).toBe(true);
    expect(st.truncatedBy).toBe("backend");
    expect(st.totalRowsServer).toBe(200_000);
  });

  // Control: an untruncated run must leave both flags clear, so a `done`
  // handler that always sets `truncated` fails here.
  it("done without truncation leaves truncated flags clear", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1, 10));
    s.appendChunk(rowsChunk(10, 1));
    s.appendChunk({
      kind: "done",
      rowsTotal: 10,
      ms: 5,
      generation: 1,
      truncated: false,
      totalRows: 10,
    });
    const st = useQueryResultStore.getState();
    expect(st.truncated).toBe(false);
    expect(st.truncatedBy).toBeNull();
  });

  it("store-side cap attributes truncation to the store", () => {
    resetStores(20);
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk(metaChunk(1, 50));
    s.appendChunk(rowsChunk(50, 1));
    const st = useQueryResultStore.getState();
    expect(st.truncated).toBe(true);
    expect(st.truncatedBy).toBe("store");
    expect(st.columnar!.row_count).toBe(20);
  });

  it("err sets streamError and streaming=false", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(1);
    s.appendChunk({ kind: "err", message: "boom", generation: 1 });
    const st = useQueryResultStore.getState();
    expect(st.streaming).toBe(false);
    expect(st.streamError).toBe("boom");
  });

  it("rejects chunks with stale generation (no state change)", () => {
    const s = useQueryResultStore.getState();
    s.beginStream(5);
    s.appendChunk(metaChunk(5, 10));
    const before = useQueryResultStore.getState();
    // Stale meta from gen=4 — must not overwrite columns.
    s.appendChunk(metaChunk(4, 9999));
    s.appendChunk(rowsChunk(20, 4));
    s.appendChunk({ kind: "done", rowsTotal: 0, ms: 99, generation: 4, truncated: false, totalRows: 0 });
    s.appendChunk({ kind: "err", message: "stale", generation: 4 });
    const after = useQueryResultStore.getState();
    expect(after.totalRowsServer).toBe(before.totalRowsServer);
    expect(after.columnar!.row_count).toBe(0);
    expect(after.streaming).toBe(true);
    expect(after.streamError).toBeNull();
    expect(after.durationMs).toBeNull();
  });
});
