/**
 * Every module under `src/` must be reachable from the app entry point.
 *
 * Three features shipped fully implemented but unreachable — the SQL import
 * dialog, a keyboard-shortcut dispatcher, and an About box — because nothing
 * imported them and nothing checked. Grepping for a symbol name is not enough:
 * a module reached only through `lazy(() => import("./x"))` looks unused to a
 * naive search, which is how the import dialog was written off twice.
 *
 * This test walks the real import graph from `src/main.tsx`, following static
 * imports, re-exports, dynamic `import()` (including inside `lazy()`), and
 * Vite query suffixes such as `?worker`. Anything it cannot reach is dead
 * code: delete it, or wire it up.
 */

import { describe, expect, it } from 'vitest';

/** Collapse `a/./b`, `a/b/../c` — enough for the specifiers in this tree. */
function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function dirname(p: string): string {
  const at = p.lastIndexOf('/');
  return at === -1 ? '' : p.slice(0, at);
}

/**
 * Modules that are deliberately unreachable from the entry point. Add an
 * entry only with a reason — an unexplained exemption here re-opens exactly
 * the hole this test closes.
 */
const ALLOWED_ORPHANS: string[] = [];

const ENTRY = 'src/main.tsx';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Raw sources for the whole tree. Keys arrive relative to this directory.
const RAW = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** `../components/x.tsx` -> `src/components/x.tsx` */
function toRepoPath(globKey: string): string {
  return normalize(`src/__tests__/${globKey}`);
}

const sources = new Map<string, string>();
for (const [key, text] of Object.entries(RAW)) {
  sources.set(toRepoPath(key), text);
}

const isTestFile = (file: string) =>
  file.includes('/__tests__/') || file.includes('.test.') || file.endsWith('.d.ts');

/**
 * Import specifiers: `from "x"`, bare `import "x"`, `import("x")` (what
 * `lazy()` contains), `require("x")`, and `new URL("x", ...)`.
 */
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|new\s+URL\(\s*['"]([^'"]+)['"]/g;

function resolve(specifier: string, importer: string): string | null {
  // Drop Vite query suffixes: `./filter-worker?worker`, `./x.sql?raw`.
  const bare = specifier.split('?')[0];

  let base: string;
  if (bare.startsWith('@/')) base = `src/${bare.slice(2)}`;
  else if (bare.startsWith('.')) base = `${dirname(importer)}/${bare}`;
  else return null; // package import

  base = normalize(base);
  const candidates = [
    base,
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => `${base}/index${e}`),
  ];
  return candidates.find((c) => sources.has(c)) ?? null;
}

function importsOf(file: string): string[] {
  const text = sources.get(file);
  if (text === undefined) return [];
  const out: string[] = [];
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;
    const resolved = resolve(specifier, file);
    if (resolved) out.push(resolved);
  }
  return out;
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...importsOf(current));
  }
  return seen;
}

describe('module reachability', () => {
  it('finds the entry point and a healthy chunk of the tree', () => {
    expect(sources.has(ENTRY)).toBe(true);
    expect(sources.size).toBeGreaterThan(100);
  });

  it('reaches every module from the entry point', () => {
    const reachable = reachableFrom(ENTRY);
    const orphans = [...sources.keys()]
      .filter((f) => !reachable.has(f))
      .filter((f) => !isTestFile(f))
      .filter((f) => !ALLOWED_ORPHANS.includes(f))
      .sort();
    expect(orphans).toEqual([]);
  });

  it('follows a lazy() dynamic import, not just static ones', () => {
    // The SQL import dialog is only ever reached this way.
    const layout = 'src/components/layout/ConnectedLayout.tsx';
    expect(sources.has(layout)).toBe(true);
    expect(importsOf(layout)).toContain('src/components/import/import-dialog.tsx');
  });

  it('follows a ?worker import', () => {
    const consumer = [...sources.keys()].find((f) =>
      (sources.get(f) as string).includes('?worker'),
    );
    expect(consumer, 'expected some module to import a worker').toBeTruthy();
    expect(importsOf(consumer as string).some((i) => i.includes('worker'))).toBe(true);
  });

  // Control: the walk can actually report a miss — otherwise "no orphans"
  // would pass just as happily on a broken resolver.
  it('reports a module nothing imports', () => {
    const reachable = reachableFrom(ENTRY);
    expect(reachable.has('src/components/shared/about-dialog.tsx')).toBe(true);
    expect(reachable.has('src/this-module-does-not-exist.ts')).toBe(false);

    const isolated = reachableFrom('src/components/shared/about-dialog.tsx');
    expect(isolated.has(ENTRY)).toBe(false);
  });
});
