/**
 * D2-class regression: a tooltip that hardcodes a modifier-key combo can
 * drift from the registry the moment someone rebinds the command — exactly
 * how D1 (Inspector) and the design-spec's own D2 finding (`toggleFilter`
 * advertising `nav.toggleAiChat`'s key) happened. `useCommandRegistry.ts`'s
 * `COMMAND_DEFINITIONS` is the one source of truth; every other site must
 * read it (`getEffectiveBinding`/`useEffectiveBinding`) rather than spell the
 * combo out as a string literal.
 *
 * Rule + reasoned allow-list, same convention as `a11y-source-invariants.test.ts`:
 * a hardcoded literal is banned unless explicitly allow-listed with why. The
 * six current entries are pre-existing, still-correct-today debt outside
 * this fix's scope (D1: the Inspector shortcut only) — listed, not silently
 * left uncovered, so a *new* hardcoded site still fails the rule.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** A literal (non-template) `title="…"` / `aria-label="…"` containing a raw modifier combo. */
const HARDCODED_SHORTCUT = /(title|aria-label)=(["'])[^"'`]*\b(Ctrl|Alt|Cmd|Meta)\+[^"'`]*\2/;

const ALLOWED: Array<{ file: string; line: number; reason: string }> = [
  { file: '../components/grid/contextual-bar.tsx', line: 33, reason: 'data.insertRow — not yet wired to the registry; pre-existing, out of D1 scope' },
  { file: '../components/grid/pending-changes-strip.tsx', line: 88, reason: 'grid Undo — not a COMMAND_DEFINITIONS entry; pre-existing debt, moved here with the controls' },
  { file: '../components/grid/pending-changes-strip.tsx', line: 92, reason: 'grid Redo — not a COMMAND_DEFINITIONS entry; pre-existing debt, moved here with the controls' },
  { file: '../components/layout/run-split-button.tsx', line: 109, reason: 'editor.run — matches the registry today but reads a literal; pre-existing, out of D1 scope' },
  { file: '../components/layout/Toolbar.tsx', line: 173, reason: 'nav.toggleSidebar — matches the registry today but reads a literal; pre-existing, out of D1 scope' },
  { file: '../components/layout/Toolbar.tsx', line: 289, reason: 'app.settings — matches the registry today but reads a literal; pre-existing, out of D1 scope' },
];

describe('D2-class: no new hardcoded shortcut string in a tooltip/label', () => {
  it('every remaining hardcoded combo is explicitly allow-listed', () => {
    const allowedSet = new Set(ALLOWED.map((a) => `${a.file}:${a.line}`));
    const offenders: string[] = [];

    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.includes('__tests__') || path.includes('.test.')) continue;
      text.split('\n').forEach((line, i) => {
        if (!HARDCODED_SHORTCUT.test(line)) return;
        if (allowedSet.has(`${path}:${i + 1}`)) return;
        offenders.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-list itself still matches real, current source lines', () => {
    for (const entry of ALLOWED) {
      const text = SOURCES[entry.file]?.split('\n')[entry.line - 1];
      expect(text, `${entry.file}:${entry.line} — ${entry.reason}`).toBeDefined();
      expect(
        HARDCODED_SHORTCUT.test(text as string),
        `${entry.file}:${entry.line} no longer carries a hardcoded shortcut — remove this stale allow-list entry`,
      ).toBe(true);
    }
  });

  it("the Inspector's dock/status-bar/toolbar tooltips do not hardcode a combo (regression coverage for D1)", () => {
    for (const file of ['../components/layout/StatusBar.tsx', '../components/layout/Toolbar.tsx', '../components/layout/right-dock.tsx']) {
      const text = SOURCES[file];
      expect(text, file).toBeDefined();
      expect(text).not.toMatch(/Ctrl\+Shift\+[IO]\b/);
    }
  });
});

const JSON_SOURCES = import.meta.glob('../i18n/locales/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('D2-class: i18n shortcut strings interpolate, never hardcode', () => {
  it('statusBar.toggleInspector interpolates {{shortcut}} rather than a literal combo', () => {
    expect(Object.keys(JSON_SOURCES).length).toBeGreaterThanOrEqual(2);
    for (const [path, text] of Object.entries(JSON_SOURCES)) {
      const match = /"toggleInspector"\s*:\s*"([^"]*)"/.exec(text);
      expect(match, `${path}: statusBar.toggleInspector not found`).toBeTruthy();
      const value = match![1];
      expect(value, path).toContain('{{shortcut}}');
      expect(value, path).not.toMatch(/Ctrl\+/);
    }
  });
});
