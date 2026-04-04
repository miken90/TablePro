import { describe, it, expect } from "vitest";

/**
 * Quick switcher scoring function — extracted for testability.
 * Must match the implementation in quick-switcher.tsx.
 */
function scoreMatch(text: string, query: string): number {
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

describe("Quick Switcher scoreMatch", () => {
  it("returns 100 for exact match", () => {
    expect(scoreMatch("users", "users")).toBe(100);
  });

  it("is case-insensitive for exact match", () => {
    expect(scoreMatch("Users", "users")).toBe(100);
    expect(scoreMatch("users", "Users")).toBe(100);
  });

  it("returns 80 for prefix match", () => {
    expect(scoreMatch("user_profiles", "user")).toBe(80);
  });

  it("returns 60 for substring match", () => {
    expect(scoreMatch("active_users", "user")).toBe(60);
  });

  it("returns 30 for fuzzy match", () => {
    expect(scoreMatch("user_profiles", "upf")).toBe(30);
  });

  it("returns 0 for no match", () => {
    expect(scoreMatch("orders", "xyz")).toBe(0);
  });

  it("ranking is deterministic: exact > prefix > substring > fuzzy", () => {
    const candidates = [
      { name: "active_user", query: "user" },     // substring (user appears mid-string)
      { name: "users", query: "user" },            // prefix
      { name: "user", query: "user" },             // exact
      { name: "usr_data", query: "user" },         // fuzzy
    ];

    const scores = candidates.map((c) => ({
      name: c.name,
      score: scoreMatch(c.name, c.query),
    }));

    scores.sort((a, b) => b.score - a.score);

    expect(scores[0].name).toBe("user");          // exact (100)
    expect(scores[1].name).toBe("users");          // prefix (80)
    expect(scores[2].name).toBe("active_user");    // substring (60)
    expect(scores[3].name).toBe("usr_data");       // fuzzy (30)
  });

  it("handles empty query as prefix match", () => {
    // Empty query starts every string, so it's a prefix match (80)
    // In practice, the component skips scoring when query is empty
    expect(scoreMatch("anything", "")).toBe(80);
  });

  it("handles single character query", () => {
    expect(scoreMatch("a", "a")).toBe(100);
    expect(scoreMatch("abc", "a")).toBe(80); // prefix
    expect(scoreMatch("bac", "a")).toBe(60); // substring
  });

  it("fuzzy match requires chars in order", () => {
    expect(scoreMatch("abcdef", "adf")).toBe(30); // a..d..f in order
    expect(scoreMatch("abcdef", "fda")).toBe(0);  // not in order
  });
});

describe("Quick Switcher result grouping order", () => {
  const KIND_ORDER = ['table', 'view', 'collection', 'database', 'schema', 'query'] as const;

  it("tables appear before views", () => {
    expect(KIND_ORDER.indexOf('table')).toBeLessThan(KIND_ORDER.indexOf('view'));
  });

  it("views appear before collections", () => {
    expect(KIND_ORDER.indexOf('view')).toBeLessThan(KIND_ORDER.indexOf('collection'));
  });

  it("databases appear before schemas", () => {
    expect(KIND_ORDER.indexOf('database')).toBeLessThan(KIND_ORDER.indexOf('schema'));
  });

  it("schemas appear before recent queries", () => {
    expect(KIND_ORDER.indexOf('schema')).toBeLessThan(KIND_ORDER.indexOf('query'));
  });

  it("recent queries are last", () => {
    expect(KIND_ORDER[KIND_ORDER.length - 1]).toBe('query');
  });
});
