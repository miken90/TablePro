/**
 * Post-connect metadata load: tables, routines, and schemas used to be
 * fetched strictly in sequence (`fetchSchema` awaited `fetchTables` then
 * `fetchRoutines`, then Sidebar chained `fetchSchemas` after that). This pins
 * `loadInitialMetadata`, which fires all three concurrently instead.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetInvokeImpl, __setInvokeImpl } from "../__tests__/mocks/tauri";
import { useSchemaStore } from "./schemaStore";
import { useConnectionStore } from "./connectionStore";
import { DEFAULT_CAPABILITIES } from "../types/capability";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useSchemaStore.setState({
    tables: [],
    columnsByTable: new Map(),
    fkMap: {},
    databases: [],
    selectedDatabase: null,
    schemas: [],
    currentSchema: null,
    routineCatalog: null,
    isLoading: false,
    error: null,
    capabilities: DEFAULT_CAPABILITIES,
  });
  useConnectionStore.setState({
    selectedConnectionId: "conn-1",
    sessionIds: new Map([["conn-1", "session-1"]]),
  });
});

afterEach(() => {
  __resetInvokeImpl();
});

describe("loadInitialMetadata — concurrent post-connect fetch", () => {
  it("issues tables, routines, and schemas together — none waits for another to resolve first", async () => {
    const callOrder: string[] = [];
    const deferredTables = deferred<unknown[]>();
    const deferredRoutines = deferred<unknown>();
    const deferredSchemas = deferred<string[]>();

    __setInvokeImpl((cmd) => {
      callOrder.push(cmd);
      if (cmd === "fetch_tables") return deferredTables.promise;
      if (cmd === "fetch_routines") return deferredRoutines.promise;
      if (cmd === "fetch_schemas") return deferredSchemas.promise;
      return Promise.resolve(null);
    });

    const loadPromise = useSchemaStore.getState().loadInitialMetadata("session-1", "postgres");

    // All three IPC calls are issued before any of them has a chance to
    // resolve — proves they started concurrently, not chained off each
    // other's result. (The old sequential code would show only
    // `fetch_tables` here; `fetch_routines`/`fetch_schemas` never fired
    // until the tables promise settled.)
    expect(callOrder).toEqual(["fetch_tables", "fetch_routines", "fetch_schemas"]);

    // Resolve out of order to show application doesn't depend on this order.
    deferredRoutines.resolve({ supported: true, reason: null, items: [] });
    deferredSchemas.resolve(["public"]);
    deferredTables.resolve([{ name: "users", schema: "public", tableType: "TABLE", rowCountEstimate: null }]);

    await loadPromise;

    const state = useSchemaStore.getState();
    expect(state.tables).toEqual([{ name: "users", schema: "public", tableType: "TABLE", rowCountEstimate: null }]);
    expect(state.schemas).toEqual(["public"]);
    expect(state.routineCatalog).toEqual({ supported: true, reason: null, items: [] });
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("populates tables even when the routines fetch is rejected (permission-restricted database)", async () => {
    __setInvokeImpl((cmd) => {
      if (cmd === "fetch_tables") return Promise.resolve([{ name: "orders", schema: null, tableType: "TABLE", rowCountEstimate: null }]);
      if (cmd === "fetch_routines") return Promise.reject(new Error("permission denied for schema public"));
      if (cmd === "fetch_schemas") return Promise.resolve(["public"]);
      return Promise.resolve(null);
    });

    await useSchemaStore.getState().loadInitialMetadata("session-1", "postgres");

    const state = useSchemaStore.getState();
    expect(state.tables).toEqual([{ name: "orders", schema: null, tableType: "TABLE", rowCountEstimate: null }]);
    expect(state.schemas).toEqual(["public"]);
    // Routine metadata failing stays silent, same as before parallelization.
    expect(state.routineCatalog).toBeNull();
    expect(state.error).toBeNull();
  });

  it("populates routines even when the tables fetch is rejected", async () => {
    __setInvokeImpl((cmd) => {
      if (cmd === "fetch_tables") return Promise.reject(new Error("Schema loading timed out"));
      if (cmd === "fetch_routines") return Promise.resolve({ supported: true, reason: null, items: [{ name: "proc1" }] });
      if (cmd === "fetch_schemas") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    await useSchemaStore.getState().loadInitialMetadata("session-1", "postgres");

    const state = useSchemaStore.getState();
    // Tables failing no longer blocks routines from being fetched and applied
    // — the old sequential `fetchSchema` never even called `fetch_routines`
    // once `fetch_tables` threw.
    expect(state.routineCatalog).toEqual({ supported: true, reason: null, items: [{ name: "proc1" }] });
    expect(state.error).toMatch(/timed out/);
  });

  it("ignores a stale response after the user has switched to a different connection mid-load", async () => {
    const deferredTables = deferred<unknown[]>();
    __setInvokeImpl((cmd) => {
      if (cmd === "fetch_tables") return deferredTables.promise;
      if (cmd === "fetch_routines") return Promise.resolve({ supported: true, reason: null, items: [] });
      if (cmd === "fetch_schemas") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const loadPromise = useSchemaStore.getState().loadInitialMetadata("session-1", "postgres");

    // The user switches to a different, already-connected connection before
    // the slow `session-1` tables fetch resolves.
    useConnectionStore.setState({
      selectedConnectionId: "conn-2",
      sessionIds: new Map([
        ["conn-1", "session-1"],
        ["conn-2", "session-2"],
      ]),
    });

    deferredTables.resolve([{ name: "stale-table", schema: null, tableType: "TABLE", rowCountEstimate: null }]);
    await loadPromise;

    const state = useSchemaStore.getState();
    expect(state.tables).toEqual([]);
    expect(state.schemas).toEqual([]);
    expect(state.routineCatalog).toBeNull();
    // The in-flight counter is still released even though the result itself
    // was dropped — otherwise `isLoading` would stay stuck true.
    expect(state.isLoading).toBe(false);
  });

  it("does not overwrite fresher data when a reconnect on the SAME connection gets a new session id", async () => {
    const deferredTables = deferred<unknown[]>();
    __setInvokeImpl((cmd) => {
      if (cmd === "fetch_tables") return deferredTables.promise;
      if (cmd === "fetch_routines") return Promise.resolve({ supported: true, reason: null, items: [] });
      if (cmd === "fetch_schemas") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const loadPromise = useSchemaStore.getState().loadInitialMetadata("session-1", "postgres");

    // Same connection id, but a fresh session (disconnect + reconnect race).
    useConnectionStore.setState({
      selectedConnectionId: "conn-1",
      sessionIds: new Map([["conn-1", "session-1-b"]]),
    });

    deferredTables.resolve([{ name: "stale-table", schema: null, tableType: "TABLE", rowCountEstimate: null }]);
    await loadPromise;

    expect(useSchemaStore.getState().tables).toEqual([]);
  });
});

describe("isLoading stays true across the whole concurrent load", () => {
  it("keeps isLoading true while a fetchDatabases call is still in flight alongside loadInitialMetadata", async () => {
    const deferredDatabases = deferred<string[]>();
    __setInvokeImpl((cmd) => {
      if (cmd === "fetch_databases") return deferredDatabases.promise;
      if (cmd === "fetch_tables") return Promise.resolve([]);
      if (cmd === "fetch_routines") return Promise.resolve({ supported: true, reason: null, items: [] });
      if (cmd === "fetch_schemas") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const databasesPromise = useSchemaStore.getState().fetchDatabases("session-1");
    const metadataPromise = useSchemaStore.getState().loadInitialMetadata("session-1", "postgres");

    // loadInitialMetadata's own three fetches have already resolved (they
    // were mocked to resolve immediately), but fetchDatabases is still
    // pending — isLoading must not have dropped early.
    await metadataPromise;
    expect(useSchemaStore.getState().isLoading).toBe(true);

    deferredDatabases.resolve(["db1"]);
    await databasesPromise;
    expect(useSchemaStore.getState().isLoading).toBe(false);
  });
});
