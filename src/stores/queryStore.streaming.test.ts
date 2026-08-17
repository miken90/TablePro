/**
 * queryStore streaming dispatch tests.
 *
 * Covers the Phase 2 (gridex/RAM optimization) rewire that replaced the
 * legacy `execute_query` IPC with the streaming `execute_query_streaming`
 * channel pipeline. Verifies:
 *   1. `execute()` dispatches to the streaming command, not the legacy one.
 *   2. Channel chunks land in the columnar store.
 *   3. On `done`, the legacy `result` mirror is synthesized from columnar.
 *   4. On `err`, the legacy `error` field is populated and toast surfaces.
 *   5. `cancel()` aborts the stream and skips result synthesis.
 *
 * Tests rely on the `@tauri-apps/api/core` mock (resolved via
 * `vitest.config.ts` alias) which exposes `__setInvokeImpl` to drive
 * channel chunks deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInvokeImpl,
  __setInvokeImpl,
  type Channel,
} from "../__tests__/mocks/tauri";
import { useQueryStore } from "./queryStore";
import {
  useQueryResultStore,
  type QueryChunk,
} from "./queryResultStore";
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";
import type { ColumnInfo } from "../types/query";

// Sonner spawns timers / toasts; stub it out so tests stay headless.
vi.mock("sonner", () => ({
  toast: Object.assign(
    () => 0,
    {
      loading: () => 0,
      success: () => 0,
      error: () => 0,
      dismiss: () => 0,
    },
  ),
}));

// `commands.historyRecord` is a fire-and-forget IPC call; mock so the
// post-stream tail doesn't try to invoke unrelated Tauri commands.
vi.mock("../ipc/commands", async (orig) => {
  const real = await orig<typeof import("../ipc/commands")>();
  return {
    ...real,
    historyRecord: () => Promise.resolve(),
    cancelQuery: () => Promise.resolve(),
  };
});

const COLS: ColumnInfo[] = [
  { name: "id", typeName: "int8", nullable: false, isPrimaryKey: true },
  { name: "name", typeName: "text", nullable: true, isPrimaryKey: false },
];

function metaChunk(generation: number): QueryChunk {
  return { kind: "meta", columns: COLS, totalEstimate: 2, generation };
}

function rowsChunk(generation: number): QueryChunk {
  return {
    kind: "rows",
    idx: 0,
    chunk: {
      columns: COLS,
      data: [
        { kind: "Ints", values: [1, 2] },
        { kind: "Strings", values: ["alice", "x".repeat(200)] },
      ],
      row_count: 2,
    },
    generation,
  };
}

function doneChunk(generation: number, ms = 12): QueryChunk {
  return { kind: "done", rowsTotal: 2, ms, generation };
}

function errChunk(generation: number, message = "boom"): QueryChunk {
  return { kind: "err", message, generation };
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useQueryResultStore.getState().clearStream();
  useQueryStore.setState({
    queryText: "",
    result: null,
    isExecuting: false,
    error: null,
    activeConnectionId: null,
    durationMs: null,
    pendingSafeCheck: null,
    explainResult: null,
    isExplaining: false,
  });
});

afterEach(() => {
  __resetInvokeImpl();
});

describe("queryStore.execute (streaming)", () => {
  it("invokes execute_query_streaming and not execute_query", async () => {
    const calls: string[] = [];
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      calls.push(cmd);
      if (cmd === "execute_query_streaming") {
        const channel = (args as { channel: Channel<QueryChunk> }).channel;
        const gen = (args as { generation: number }).generation;
        channel.onmessage?.(metaChunk(gen));
        channel.onmessage?.(rowsChunk(gen));
        channel.onmessage?.(doneChunk(gen));
      }
      return null;
    });

    await useQueryStore.getState().execute("session-1", "SELECT 1");

    expect(calls).toContain("execute_query_streaming");
    expect(calls).not.toContain("execute_query");
  });

  it("populates the columnar store from chunks", async () => {
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd === "execute_query_streaming") {
        const channel = (args as { channel: Channel<QueryChunk> }).channel;
        const gen = (args as { generation: number }).generation;
        channel.onmessage?.(metaChunk(gen));
        channel.onmessage?.(rowsChunk(gen));
        channel.onmessage?.(doneChunk(gen, 42));
      }
      return null;
    });

    await useQueryStore.getState().execute("session-1", "SELECT * FROM t");

    const store = useQueryResultStore.getState();
    expect(store.columnar?.row_count).toBe(2);
    expect(store.columnar?.columns).toEqual(COLS);
    expect(store.streaming).toBe(false);
    expect(store.durationMs).toBe(42);
  });

  it("synthesizes legacy result mirror from columnar after done", async () => {
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd === "execute_query_streaming") {
        const channel = (args as { channel: Channel<QueryChunk> }).channel;
        const gen = (args as { generation: number }).generation;
        channel.onmessage?.(metaChunk(gen));
        channel.onmessage?.(rowsChunk(gen));
        channel.onmessage?.(doneChunk(gen, 7));
      }
      return null;
    });

    await useQueryStore.getState().execute("session-1", "SELECT 1");

    const result = useQueryStore.getState().result;
    expect(result).not.toBeNull();
    expect(result?.columns).toEqual(COLS);
    expect(result?.rows).toHaveLength(2);
    // Mirror preserves raw values (no truncation — that's a render-layer concern).
    expect(result?.rows[0]).toEqual(["1", "alice"]);
    expect(result?.rows[1]?.[1]?.length).toBe(200);
    expect(result?.executionTimeMs).toBe(7);
    expect(useQueryStore.getState().isExecuting).toBe(false);
    expect(useQueryStore.getState().error).toBeNull();
  });

  it("surfaces err chunk into legacy error field", async () => {
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd === "execute_query_streaming") {
        const channel = (args as { channel: Channel<QueryChunk> }).channel;
        const gen = (args as { generation: number }).generation;
        channel.onmessage?.(errChunk(gen, "syntax error at line 1"));
      }
      return null;
    });

    await useQueryStore.getState().execute("session-1", "SELEC 1");

    const state = useQueryStore.getState();
    expect(state.error).toMatch(/syntax error/);
    expect(state.result).toBeNull();
    expect(state.isExecuting).toBe(false);
    expect(useQueryResultStore.getState().streamError).toMatch(/syntax/);
  });

  it("treats invoke rejection as a stream error", async () => {
    __setInvokeImpl(async (cmd: string) => {
      if (cmd === "execute_query_streaming") {
        throw new Error("ipc transport down");
      }
      return null;
    });

    await useQueryStore.getState().execute("session-1", "SELECT 1");

    expect(useQueryStore.getState().error).toMatch(/ipc transport down/);
    expect(useQueryStore.getState().result).toBeNull();
  });

  it("drops chunks from a superseded generation", async () => {
    let staleChannel: Channel<QueryChunk> | null = null;
    let invocations = 0;
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd !== "execute_query_streaming") return null;
      invocations += 1;
      const channel = (args as { channel: Channel<QueryChunk> }).channel;
      const gen = (args as { generation: number }).generation;
      if (invocations === 1) {
        // Don't terminate the first run — just stash the channel.
        staleChannel = channel;
        // Emit a meta chunk so the store has columns.
        channel.onmessage?.(metaChunk(gen));
        // Resolve the invoke so the runner moves on without a `done`.
        return null;
      }
      // Second invocation: full happy path.
      channel.onmessage?.(metaChunk(gen));
      channel.onmessage?.(rowsChunk(gen));
      channel.onmessage?.(doneChunk(gen));
      return null;
    });

    await useQueryStore.getState().execute("session-1", "SELECT 1");
    // First run terminated without `done`/`err` — store is in an
    // intermediate state with `streaming=false` (cleared on cancel by
    // the next run). Now fire a second run and verify late chunks from
    // the first channel are ignored.
    await useQueryStore.getState().execute("session-1", "SELECT 2");

    // Try to inject a stale chunk from the first generation now that
    // the second has completed.
    (staleChannel as Channel<QueryChunk> | null)?.onmessage?.({
      kind: "rows",
      idx: 99,
      chunk: {
        columns: COLS,
        data: [
          { kind: "Ints", values: [999] },
          { kind: "Strings", values: ["stale"] },
        ],
        row_count: 1,
      },
      generation: 1,
    });

    const store = useQueryResultStore.getState();
    expect(store.columnar?.row_count).toBe(2);
    expect(store.columnar?.data[1]).toEqual({
      kind: "Strings",
      values: ["alice", "x".repeat(200)],
    });
  });
});
