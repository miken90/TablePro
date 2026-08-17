/**
 * Per-tab cancellation ownership tests.
 *
 * The in-flight stream cancel handle used to live at module scope, so any
 * new run — in any tab — invoked it. Opening two query tabs, starting a long
 * query in tab A and running anything in tab B cancelled tab A's query out
 * from under the user. Handles are now keyed by owning tab; these tests pin
 * that down:
 *   1. Running in tab B does not cancel tab A's in-flight query.
 *   2. Cancelling tab A cancels only tab A.
 *   3. A second run in the SAME tab still supersedes its own prior run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInvokeImpl,
  __setInvokeImpl,
  type Channel,
} from "../__tests__/mocks/tauri";
import {
  __activeStreamKeys,
  __resetTabStreams,
  useQueryStore,
} from "./queryStore";
import { useEditorStore } from "./editorStore";
import { useQueryResultStore, type QueryChunk } from "./queryResultStore";
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";
import type { ColumnInfo } from "../types/query";

vi.mock("sonner", () => ({
  toast: Object.assign(() => 0, {
    loading: () => 0,
    success: () => 0,
    error: () => 0,
    dismiss: () => 0,
  }),
}));

vi.mock("../ipc/commands", async (orig) => {
  const real = await orig<typeof import("../ipc/commands")>();
  return {
    ...real,
    historyRecord: () => Promise.resolve(),
    // Routed through the raw `invoke` mock below so the test can observe it.
    cancelQuery: () => Promise.resolve(),
  };
});

const COLS: ColumnInfo[] = [
  { name: "id", typeName: "int8", nullable: false, isPrimaryKey: true },
];

function metaChunk(generation: number): QueryChunk {
  return { kind: "meta", columns: COLS, totalEstimate: 1, generation };
}

function doneChunk(generation: number): QueryChunk {
  return { kind: "done", rowsTotal: 0, ms: 1, generation };
}

interface StreamArgs {
  channel: Channel<QueryChunk>;
  generation: number;
  sessionId: string;
}

/** Invoke stub where every `execute_query_streaming` call hangs until its
 *  session is explicitly released, so several tabs can be in flight at once. */
function installHangingInvoke() {
  const cancelled: string[] = [];
  const releases: Array<() => void> = [];

  __setInvokeImpl(async (cmd: string, args?: unknown) => {
    if (cmd === "cancel_query") {
      cancelled.push((args as { sessionId: string }).sessionId);
      return null;
    }
    if (cmd !== "execute_query_streaming") return null;
    const { channel, generation } = args as StreamArgs;
    channel.onmessage?.(metaChunk(generation));
    await new Promise<void>((resolve) => releases.push(resolve));
    return null;
  });

  return {
    cancelled,
    /** Let every hanging stream finish so pending runs settle. */
    releaseAll() {
      releases.splice(0).forEach((resolve) => resolve());
    },
  };
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useQueryResultStore.getState().clearStream();
  __resetTabStreams();
  useEditorStore.setState({ tabs: [], activeTabId: null });
  useQueryStore.setState({
    result: null,
    isExecuting: false,
    error: null,
    durationMs: null,
  });
});

afterEach(() => {
  __resetInvokeImpl();
  __resetTabStreams();
});

describe("queryStore per-tab cancellation", () => {
  it("does not cancel tab A when a query starts in tab B", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({ activeTabId: "tab-A" });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");
    expect(__activeStreamKeys()).toEqual(["tab-A"]);

    useEditorStore.setState({ activeTabId: "tab-B" });
    const runB = useQueryStore.getState().execute("session-B", "SELECT 1");

    // The bug: tab B's run used to fire tab A's cancel handle.
    expect(stub.cancelled).not.toContain("session-A");
    expect(__activeStreamKeys()).toEqual(["tab-A", "tab-B"]);

    stub.releaseAll();
    await Promise.all([runA, runB]);
  });

  it("cancels only the tab that was cancelled", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({ activeTabId: "tab-A" });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");
    useEditorStore.setState({ activeTabId: "tab-B" });
    const runB = useQueryStore.getState().execute("session-B", "SELECT pg_sleep(60)");

    useEditorStore.setState({ activeTabId: "tab-A" });
    await useQueryStore.getState().cancel("session-A");

    expect(stub.cancelled).toEqual(["session-A"]);
    expect(__activeStreamKeys()).toContain("tab-B");

    stub.releaseAll();
    await Promise.all([runA, runB]);
  });

  it("still supersedes a prior run in the same tab", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({ activeTabId: "tab-A" });
    const first = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");
    const second = useQueryStore.getState().execute("session-A", "SELECT 1");

    expect(stub.cancelled).toEqual(["session-A"]);
    expect(__activeStreamKeys()).toEqual(["tab-A"]);

    stub.releaseAll();
    await Promise.all([first, second]);
  });

  it("falls back to a session-scoped key when no tab is active", async () => {
    const stub = installHangingInvoke();

    const run = useQueryStore.getState().execute("session-A", "SELECT 1");
    expect(__activeStreamKeys()).toEqual(["session:session-A"]);

    stub.releaseAll();
    await run;
  });
});

describe("queryStore stream generations", () => {
  it("mints distinct generations across tabs so chunks cannot cross over", async () => {
    const generations: number[] = [];
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd !== "execute_query_streaming") return null;
      const { channel, generation } = args as StreamArgs;
      generations.push(generation);
      channel.onmessage?.(metaChunk(generation));
      channel.onmessage?.(doneChunk(generation));
      return null;
    });

    useEditorStore.setState({ activeTabId: "tab-A" });
    await useQueryStore.getState().execute("session-A", "SELECT 1");
    useEditorStore.setState({ activeTabId: "tab-B" });
    await useQueryStore.getState().execute("session-B", "SELECT 1");

    expect(generations).toHaveLength(2);
    expect(generations[0]).not.toBe(generations[1]);
  });
});
