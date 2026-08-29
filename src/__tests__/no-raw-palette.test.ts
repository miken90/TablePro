/**
 * Phase 10 — a declining budget on raw Tailwind palette classes under
 * `src/components/`, not a hard zero (a full retokenization pass is scope
 * creep for this phase; the adoption work already cut both counts).
 *
 * Baseline at 62d82a86 (pre-phase-10, `git grep -Eo` count): 954 neutral,
 * 415 accent. Ceiling recorded here is the post-phase-10 count, so the next
 * phase or PR can only ratchet it down further, never back up.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../components/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const NEUTRAL_RE = /\b(zinc|slate|gray)-[0-9]{2,3}\b/g;
const ACCENT_RE = /\b(blue|red|amber|green|yellow|purple)-[0-9]{2,3}\b/g;

function countMatches(re: RegExp): number {
  let total = 0;
  for (const text of Object.values(SOURCES)) {
    total += (text.match(re) ?? []).length;
  }
  return total;
}

// Ceiling = post-phase-10 count. Update only when lowering it further.
const NEUTRAL_CEILING = 900;
const ACCENT_CEILING = 450;

describe('no-raw-palette: declining budget on raw Tailwind color classes', () => {
  it('neutral (zinc/slate/gray) usage does not exceed the recorded ceiling', () => {
    const count = countMatches(NEUTRAL_RE);
    expect(count).toBeLessThanOrEqual(NEUTRAL_CEILING);
  });

  it('accent (blue/red/amber/green/yellow/purple) usage does not exceed the recorded ceiling', () => {
    const count = countMatches(ACCENT_RE);
    expect(count).toBeLessThanOrEqual(ACCENT_CEILING);
  });
});
