/**
 * The post-connect auto-select effect used to gate `fetchSchema`/`fetchSchemas`
 * on `databases.length > 0` — a React-render-cycle proxy for "we're past
 * connect", even though neither call needs the database list's content. That
 * gating meant the tables/routines/schemas load couldn't even start until a
 * separate `fetchDatabases` round trip had resolved and re-rendered.
 *
 * Pins the fix as a source invariant: the effect no longer reads `databases`,
 * and it kicks off the concurrent `loadInitialMetadata` instead of a
 * `fetchSchema(...).then(() => fetchSchemas(...))` chain.
 */

import { describe, expect, it } from "vitest";

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

describe("Sidebar auto-select effect", () => {
  const sidebar = source("Sidebar.tsx");

  it("no longer gates the metadata load on the database list having loaded", () => {
    expect(sidebar).not.toMatch(/databases\.length > 0 && !selectedDatabase/);
  });

  it("kicks off the concurrent metadata load instead of a sequential fetchSchema/fetchSchemas chain", () => {
    expect(sidebar).toContain("loadInitialMetadata(sessionId, dbType ?? null)");
    expect(sidebar).not.toContain("fetchSchema(sessionId).then(() => fetchSchemas(sessionId))");
  });

  it("still fetches the database list independently, for the dropdown", () => {
    expect(sidebar).toContain("fetchDatabases(sessionId)");
  });
});
