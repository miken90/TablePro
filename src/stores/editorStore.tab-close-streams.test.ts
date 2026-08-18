/**
 * Closing a tab must release the query it owns.
 *
 * `closeTab` only filtered the tab array: the stream stayed registered, the
 * backend kept running the statement, and its chunks kept landing in the
 * shared result store — rendering under whichever tab became active.
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
        channel.onmessage?.({ kind: "done", rowsTotal: 0, ms: 1, generation });
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

describe("closing a tab releases its stream", () => {
  it("cancels and unregisters the in-flight stream of the closed tab", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({
      tabs: [tab("tab-A", "conn-A"), tab("tab-B", "conn-B")],
      activeTabId: "tab-A",
    });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");
    useEditorStore.setState({ activeTabId: "tab-B" });
    const runB = useQueryStore.getState().execute("session-B", "SELECT pg_sleep(60)");

    useEditorStore.getState().closeTab("tab-A");

    expect(__activeStreamKeys()).toEqual(["tab-B"]);
    expect(stub.cancelled).toEqual(["session-A"]);

    stub.releaseAll();
    await Promise.all([runA, runB]);
  });

  it("releases every closed tab when closing others", async () => {
    const stub = installHangingInvoke();

    useEditorStore.setState({
      tabs: [tab("tab-A", "conn-A"), tab("tab-B", "conn-B")],
      activeTabId: "tab-A",
    });
    const runA = useQueryStore.getState().execute("session-A", "SELECT 1");
    useEditorStore.setState({ activeTabId: "tab-B" });
    const runB = useQueryStore.getState().execute("session-B", "SELECT 1");

    useEditorStore.getState().closeOtherTabs("tab-B");

    expect(__activeStreamKeys()).toEqual(["tab-B"]);
    expect(stub.cancelled).toEqual(["session-A"]);

    stub.releaseAll();
    await Promise.all([runA, runB]);
  });

  it("drops chunks that arrive after the owning tab is closed", async () => {
    const releases: Array<() => void> = [];
    let live: { channel: Channel<QueryChunk>; generation: number } | null = null;
    __setInvokeImpl(async (cmd: string, args?: unknown) => {
      if (cmd !== "execute_query_streaming") return null;
      const { channel, generation } = args as StreamArgs;
      live = { channel, generation };
      channel.onmessage?.({ kind: "meta", columns: COLS, totalEstimate: 1, generation });
      await new Promise<void>((resolve) => releases.push(resolve));
      return null;
    });

    useEditorStore.setState({ tabs: [tab("tab-A", "conn-A")], activeTabId: "tab-A" });
    const runA = useQueryStore.getState().execute("session-A", "SELECT pg_sleep(60)");

    useEditorStore.getState().closeTab("tab-A");

    const before = useQueryResultStore.getState().columnar?.row_count ?? 0;
    live!.channel.onmessage?.({
      kind: "rows",
      idx: 0,
      chunk: {
        columns: COLS,
        data: [{ kind: "Strings", values: ["late"] }],
        row_count: 1,
      },
      generation: live!.generation,
    });
    expect(useQueryResultStore.getState().columnar?.row_count ?? 0).toBe(before);

    releases.splice(0).forEach((resolve) => resolve());
    await runA;
  });
});
