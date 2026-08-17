/**
 * Sidebar DROP / TRUNCATE / DELETE-ALL must obey Safe Mode.
 *
 * The sidebar used to build the statement itself and hand it straight to
 * `commands.executeQuery`, which is the one write path that never passes
 * through `checkSafeMode`. With Safe Mode at Level 5 ("read-only") the sidebar
 * still dropped the table. It also quoted identifiers by hand with a
 * `dbType === 'mysql'` test, which produced double-quoted names on MariaDB.
 *
 * The statement now comes from the backend generator and runs through
 * `useQueryStore.execute`. These tests pin both halves: the guard blocks the
 * statement, and the sidebar has no direct execute/quoting path left.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetInvokeImpl, __setInvokeImpl } from "../../__tests__/mocks/tauri";
import { checkSafeMode, useQueryStore, __resetTabStreams } from "../../stores/queryStore";
import { useQueryResultStore } from "../../stores/queryResultStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";

vi.mock("sonner", () => ({
  toast: Object.assign(() => 0, {
    loading: () => 0,
    success: () => 0,
    error: () => 0,
    dismiss: () => 0,
  }),
}));

vi.mock("../../ipc/commands", async (orig) => {
  const real = await orig<typeof import("../../ipc/commands")>();
  return { ...real, historyRecord: () => Promise.resolve() };
});

// Source text of the wiring sites. This vitest setup runs in `node` with no
// DOM, so the routing is asserted as text — the point is that the direct
// execute path is gone, not how the component renders.
const SOURCES = import.meta.glob("./*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function source(file: string): string {
  const text = SOURCES[`./${file}`];
  if (text === undefined) throw new Error(`source not found: ${file}`);
  return text;
}

/** SQL the backend generator returns for a sidebar DROP on PostgreSQL. */
const DROP_SQL = 'DROP TABLE "public"."orders"';

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  useQueryResultStore.getState().clearStream();
  __resetTabStreams();
  useQueryStore.setState({ error: null, isExecuting: false, pendingSafeCheck: null });
});

afterEach(() => {
  __resetInvokeImpl();
  __resetTabStreams();
});

describe("Safe Mode governs sidebar table operations", () => {
  it("blocks a sidebar DROP at Level 5 without touching the backend", async () => {
    const invoked: string[] = [];
    __setInvokeImpl(async (cmd: string) => {
      invoked.push(cmd);
      return null;
    });

    await useQueryStore.getState().execute("session-A", DROP_SQL, undefined, 5);

    expect(invoked).not.toContain("execute_query_streaming");
    expect(invoked).not.toContain("execute_query");
    expect(useQueryStore.getState().error).toMatch(/Read-only mode/);
  });

  it("holds a sidebar TRUNCATE for confirmation at Level 2", async () => {
    const invoked: string[] = [];
    __setInvokeImpl(async (cmd: string) => {
      invoked.push(cmd);
      return null;
    });

    await useQueryStore
      .getState()
      .execute("session-A", 'TRUNCATE TABLE "public"."orders"', undefined, 2);

    expect(invoked).not.toContain("execute_query_streaming");
    expect(useQueryStore.getState().pendingSafeCheck?.dangerType).toBe("destructive");
  });

  it("classifies every sidebar verb as a write", () => {
    for (const sql of [
      DROP_SQL,
      'TRUNCATE TABLE "public"."orders"',
      'DELETE FROM "public"."orders"',
    ]) {
      expect(checkSafeMode(sql, 5).blocked).toBe(true);
    }
  });
});

describe("sidebar no longer owns execution or quoting", () => {
  const sidebar = source("Sidebar.tsx");

  it("routes the confirmed operation through the query store", () => {
    expect(sidebar).toContain("generateTableOperationSql");
    expect(sidebar).toContain("useQueryStore");
    expect(sidebar).toContain("safeModeLevel");
  });

  it("does not call executeQuery directly", () => {
    expect(sidebar).not.toContain("commands.executeQuery(");
  });

  it("has no hand-rolled identifier quoting left", () => {
    expect(sidebar).not.toContain("useBacktick");
    expect(sidebar).not.toContain("TRUNCATE TABLE ");
    expect(sidebar).not.toContain("DROP TABLE ");
  });
});

describe("views are not tables", () => {
  const node = source("sidebar-table-node.tsx");
  const sidebar = source("Sidebar.tsx");
  const dialog = source("table-operation-dialog.tsx");

  it("does not offer row operations on a view", () => {
    // Truncate and Delete All Records are gated behind `!isView`.
    expect(node).toContain("const isView =");
    expect(node.match(/\{!isView && \(/g) ?? []).toHaveLength(2);
  });

  it("tells the sidebar which object kind is being dropped", () => {
    // The defect: a view was dropped with DROP TABLE, which every engine here
    // rejects.
    expect(node).toContain("onDropTable?.(table.name, table.schema, isView)");
    expect(sidebar).toContain("operation: isView ? 'drop-view' : 'drop'");
  });

  it("has its own confirmation copy for a view", () => {
    expect(dialog).toContain('"drop-view"');
    expect(dialog).toContain("Drop View");
  });
});

describe("destructive confirmation dialog", () => {
  const dialog = source("table-operation-dialog.tsx");

  it("requires the table name for all three operations", () => {
    expect(dialog).not.toContain("requireConfirmName");
    expect(dialog).toContain("if (confirmText !== tableName) return;");
  });

  it("gates the Enter key behind the same check", () => {
    expect(dialog).toContain('if (e.key === "Enter") handleConfirm();');
  });
});
