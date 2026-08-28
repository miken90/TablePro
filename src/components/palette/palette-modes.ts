import type { TableInfo } from "../../types/schema";
import type { HistoryEntry } from "../../stores/history";

/** Q1: a bare query searches objects; a leading `>` switches to commands. */
export type PaletteMode = "objects" | "commands";

/**
 * Parse the palette's raw input text into a mode and the query within it.
 * The `>` must lead (after trimming leading spaces) — `"a > b"` stays
 * objects mode with that literal text as the query, it does not switch mid
 * string.
 */
export function parsePaletteInput(raw: string): { mode: PaletteMode; query: string } {
  const leadTrimmed = raw.replace(/^\s+/, "");
  if (leadTrimmed.startsWith(">")) {
    return { mode: "commands", query: leadTrimmed.slice(1).trimStart() };
  }
  return { mode: "objects", query: raw };
}

// --- Object mode: result types, scoring, and grouping ---
// Lifted verbatim from the retired `quick-switcher.tsx:36-60` — ranking
// semantics must not change (`quick-switcher-ranking.test.ts`).

export type ResultKind = "table" | "view" | "collection" | "database" | "schema" | "query";

export interface ObjectResult {
  id: string;
  label: string;
  subtitle?: string;
  kind: ResultKind;
  score: number;
  /** For table/view/collection results */
  schema?: string | null;
  /** For query results */
  historyEntry?: HistoryEntry;
}

export interface ObjectResultGroup {
  kind: ResultKind;
  label: string;
  items: ObjectResult[];
}

export function scoreMatch(text: string, query: string): number {
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase();
  if (tLower === qLower) return 100; // exact
  if (tLower.startsWith(qLower)) return 80; // prefix
  if (tLower.includes(qLower)) return 60; // substring
  // Simple fuzzy: all query chars appear in order
  let ti = 0;
  for (let qi = 0; qi < qLower.length; qi++) {
    const found = tLower.indexOf(qLower[qi], ti);
    if (found === -1) return 0;
    ti = found + 1;
  }
  return 30; // fuzzy
}

export const KIND_ORDER: ResultKind[] = ["table", "view", "collection", "database", "schema", "query"];
export const KIND_LABELS: Record<ResultKind, string> = {
  table: "Tables",
  view: "Views",
  collection: "Collections",
  database: "Databases",
  schema: "Schemas",
  query: "Recent Queries",
};

/** Truncate a query's SQL text for display in a result row. */
export function truncateQuery(sql: string, maxLen = 80): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + "..." : oneLine;
}

export interface BuildObjectResultsInput {
  tables: TableInfo[];
  databases: string[];
  schemas: string[];
  historyEntries: HistoryEntry[];
  isDocumentDb: boolean;
  currentSchema: string | null;
  query: string;
}

/** Build the grouped, sorted object-mode results — the pure form of the old `groups` useMemo. */
export function buildObjectResults(input: BuildObjectResultsInput): ObjectResultGroup[] {
  const { tables, databases, schemas, historyEntries, isDocumentDb, currentSchema, query } = input;
  const results: ObjectResult[] = [];
  const q = query.trim();

  for (const t of tables) {
    const kind: ResultKind = isDocumentDb
      ? "collection"
      : t.tableType?.toLowerCase() === "view" ? "view" : "table";
    const score = q ? scoreMatch(t.name, q) : 50;
    if (q && score === 0) continue;
    results.push({
      id: `table:${t.name}:${t.schema ?? ""}`,
      label: t.name,
      subtitle: t.schema ?? undefined,
      kind,
      score,
      schema: t.schema,
    });
  }

  for (const db of databases) {
    const score = q ? scoreMatch(db, q) : 50;
    if (q && score === 0) continue;
    results.push({ id: `db:${db}`, label: db, kind: "database", score });
  }

  for (const s of schemas) {
    const score = q ? scoreMatch(s, q) : 50;
    if (q && score === 0) continue;
    results.push({
      id: `schema:${s}`,
      label: s,
      subtitle: currentSchema === s ? "active" : undefined,
      kind: "schema",
      score,
    });
  }

  const recentQueries = historyEntries.slice(0, 20);
  for (const entry of recentQueries) {
    const preview = truncateQuery(entry.query);
    const score = q ? scoreMatch(preview, q) : 40;
    if (q && score === 0) continue;
    results.push({
      id: `query:${entry.id}`,
      label: preview,
      subtitle: entry.database ?? undefined,
      kind: "query",
      score,
      historyEntry: entry,
    });
  }

  const grouped = new Map<ResultKind, ObjectResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.kind) ?? [];
    arr.push(r);
    grouped.set(r.kind, arr);
  }

  const output: ObjectResultGroup[] = [];
  for (const kind of KIND_ORDER) {
    const items = grouped.get(kind);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });
    output.push({ kind, label: KIND_LABELS[kind], items });
  }

  return output;
}
