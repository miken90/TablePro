/**
 * Cancellation ownership.
 *
 * Cancel used to resolve its target at cancel time: the active tab supplied
 * the stream key and the caller supplied the session id of the active tab's
 * connection. Starting a query in tab A, switching to tab B and pressing Stop
 * therefore left tab A running while issuing `cancel_query` against tab B's
 * session — aborting whatever statement that other database was running.
 * Ownership is now captured when the run starts and travels with the handle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInvokeImpl,
  __setInvokeImpl,
  type Channel,
} from "../__tests__/mocks/tauri";
import { __activeStreamKeys, __resetTabStreams, useQueryStore } from "./queryStore";
import { useEditorStore, type EditorTab } from "./editorStore";
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
    // Every backend cancel must reach the raw `invoke` mock so the test can
    // see which session it was addressed to.
    cancelQuery: () => Promise.resolve(),
  };
});

const COLS: ColumnInfo[] = [
  { name: "id", typeName: "int8", nullable: false, isPrimaryKey: true },
];

interface StreamArgs {
  channel: Channel<QueryChunk>;
  generation: number;
  sessionId: string;
}

/** Invoke stub whose streams hang until released, so several tabs can be in
 *  flight at once, recording every `cancel_query` session it receives. */
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
    channel.onmessage?.({ kind: "meta", columns: COLS, totalEstimate: 1, generation });
    // `execute_query_streaming` only answers `Ok` once it has handed a
    // terminal chunk to the channel, so a released stream ends with `done`.
    await new Promise<void>((resolve) =>
      releases.push(() => {
        channel.onmessage?.({ kind: "done", rowsTotal: 0, ms: 1, generation, truncated: false, totalRows: 0 });
        resolve();
      }),
    );
    return null;
  });

  return {
    cancelled,
    releaseAll() {
      releases.splice(0).forEach((resolve) => resolve());
    },
  };
}

function tab(id: string, connectionId: string): EditorTab {
  return {
    id,
    title: id,
    content: "",
    isDirty: false,
    isPreview: false,
    isPinned: false,
    type: "query",
    connectionId,
  };
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useQueryResultStore.getState().clearStream();
  __resetTabStreams();
  useEditorStore.setState({ tabs: [], activeTabId: null, _hydrated: false });
  useQueryStore.setState({
    result: null,
    isExecuting: false,
    error: null,
    durationMs: null,
    pendingSafeCheck: null,
  });
});

afterEach(() => {
  __resetInvokeImpl();
  __resetTabStreams();
});

describe("cancel targets the run's owner, not the active tab", () => {
  it("cancels tab A's session after the user switched to an idle tab B", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({
      tabs: [tab("tab-A", "conn-A"), tab("tab-B", "conn-B")],
      activeTabId: "tab-A",
    });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");

    // User switches to tab B, which is on a different connection and idle.
    useEditorStore.setState({ activeTabId: "tab-B" });
    await useQueryStore.getState().cancel();

    // The bug: tab B's session was cancelled and tab A kept running.
    expect(stub.cancelled).toEqual(["session-A"]);
    expect(stub.cancelled).not.toContain("session-B");

    stub.releaseAll();
    await runA;
    expect(useQueryStore.getState().isExecuting).toBe(false);
  });

  it("prefers the active tab's own run when that tab has one", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({
      tabs: [tab("tab-A", "conn-A"), tab("tab-B", "conn-B")],
      activeTabId: "tab-A",
    });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");
    useEditorStore.setState({ activeTabId: "tab-B" });
    const runB = useQueryStore.getState().execute("session-B", "SELECT pg_sleep(60)");

    await useQueryStore.getState().cancel();

    expect(stub.cancelled).toEqual(["session-B"]);
    expect(__activeStreamKeys()).toContain("tab-A");

    stub.releaseAll();
    await Promise.all([runA, runB]);
  });

  it("issues exactly one backend cancel per stopped run", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({ tabs: [tab("tab-A", "conn-A")], activeTabId: "tab-A" });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");

    await useQueryStore.getState().cancel();
    await useQueryStore.getState().cancel();

    // A second round-trip could land after the next statement had started on
    // the same connection and abort that one instead.
    expect(stub.cancelled).toEqual(["session-A"]);

    stub.releaseAll();
    await runA;
  });

  it("does not cancel anything when no run is in flight", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({ tabs: [tab("tab-A", "conn-A")], activeTabId: "tab-A" });
    await useQueryStore.getState().cancel();

    expect(stub.cancelled).toEqual([]);
  });

  it("refuses to guess when several tabs are running and none is focused", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({
      tabs: [tab("tab-A", "conn-A"), tab("tab-B", "conn-B"), tab("tab-C", "conn-C")],
      activeTabId: "tab-A",
    });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");
    useEditorStore.setState({ activeTabId: "tab-B" });
    const runB = useQueryStore.getState().execute("session-B", "SELECT pg_sleep(60)");

    // The user is looking at a third, idle tab.
    useEditorStore.setState({ activeTabId: "tab-C" });
    const outcome = await useQueryStore.getState().cancel();

    // Previously this cancelled the newest run - a query the user was not
    // looking at. Nothing is cancelled and the caller is told why.
    expect(outcome).toBe("ambiguous");
    expect(stub.cancelled).toEqual([]);
    expect(__activeStreamKeys()).toEqual(["tab-A", "tab-B"]);

    stub.releaseAll();
    await Promise.all([runA, runB]);
  });

  it("still stops a single background run from an idle tab", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({
      tabs: [tab("tab-A", "conn-A"), tab("tab-B", "conn-B")],
      activeTabId: "tab-A",
    });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");

    useEditorStore.setState({ activeTabId: "tab-B" });
    // One run in flight is unambiguous, whichever tab is focused.
    expect(await useQueryStore.getState().cancel()).toBe("cancelled");
    expect(stub.cancelled).toEqual(["session-A"]);

    stub.releaseAll();
    await runA;
  });

  it("reports an idle workspace instead of cancelling something", async () => {
    const stub = installHangingInvoke();
    useEditorStore.setState({ tabs: [tab("tab-A", "conn-A")], activeTabId: "tab-A" });

    expect(await useQueryStore.getState().cancel()).toBe("idle");
    expect(stub.cancelled).toEqual([]);
  });

  it("survives a backend cancel that rejects as unsupported", async () => {
    const cancelled: string[] = [];
    const releases: Array<() => void> = [];
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd === "cancel_query") {
        cancelled.push((args as { sessionId: string }).sessionId);
        // SQL Server / MongoDB / Redis answer `Unsupported`.
        throw new Error("Unsupported: cancel is not supported by this driver");
      }
      if (cmd !== "execute_query_streaming") return null;
      const { channel, generation } = args as StreamArgs;
      channel.onmessage?.({ kind: "meta", columns: COLS, totalEstimate: 1, generation });
      await new Promise<void>((resolve) => releases.push(resolve));
      return null;
    });

    useEditorStore.setState({ tabs: [tab("tab-A", "conn-A")], activeTabId: "tab-A" });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");

    // The rejection used to escape to the window and skip the state reset.
    await expect(useQueryStore.getState().cancel()).resolves.toBe("cancelled");
    expect(cancelled).toEqual(["session-A"]);
    expect(useQueryStore.getState().isExecuting).toBe(false);

    releases.splice(0).forEach((resolve) => resolve());
    await runA;
  });
});
