/**
 * Accessibility sweep invariants (design-spec 5.16, AUDIT B1/B2/M10).
 *
 * B1 — zero `outline-none` anywhere: a deleted focus ring with nothing
 * replacing it is exactly the defect, regardless of whether a *different*
 * ring (Field's `focus-within`, a bordered input's own outline) already
 * covers the control.
 *
 * B2 — `--color-text-muted` fails WCAG AA as body text on every surface in
 * both themes (worst 2.56:1 light on bg-hover). It is asserted by RULE, not
 * count: every remaining use must be a disabled control, or a reasoned
 * decorative-glyph/icon-only-button allow-list entry — never plain content.
 *
 * M10 — every rule that sets `hover:bg-surface-hover` or
 * `hover:bg-surface-muted` must also put visible text at `text-text-primary`
 * (directly, via an unconditional rest colour, or via a `group-hover`
 * descendant rule) — with a reasoned allow-list for a container whose text
 * lives entirely on children, or a control that intentionally hovers to a
 * semantic action colour (danger/warning) instead of primary.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function lines(path: string): string[] {
  const text = Object.entries(SOURCES).find(([key]) => key === path)?.[1];
  if (text === undefined) throw new Error(`source not found: ${path}`);
  return text.split('\n');
}

describe('B1 — zero outline-none', () => {
  it('no source file suppresses the focus outline without replacing it', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.includes('__tests__') || path.includes('.test.')) continue;
      text.split('\n').forEach((line, i) => {
        if (line.includes('outline-none') || line.includes('outline: none')) {
          offenders.push(`${path}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('B2 — text-muted is content-free', () => {
  // Every remaining `text-muted` site, with why it is not content:
  //   - a decorative icon glyph (Search/Lock/Clock/Sparkles/Chevron/type icon)
  //   - an icon-only button/control whose accessible name comes from
  //     aria-label/title elsewhere, not from this text colour
  //   - a status indicator's background fill (not text)
  //   - a purely-animated "typing" indicator (dots), not read as text
  const ALLOWED: Array<{ file: string; line: number; reason: string }> = [
    { file: '../components/ai/ai-chat-message.tsx', line: 69, reason: 'pulsing-dot typing indicator, not text content' },
    { file: '../components/ai/ai-chat-panel.tsx', line: 59, reason: 'decorative Sparkles icon' },
    { file: '../components/ai/ai-conversation-list.tsx', line: 83, reason: 'icon-only delete button, hover to accent-red (semantic)' },
    { file: '../components/ai/ai-code-block.tsx', line: 33, reason: 'icon-only copy button, hover to accent-blue (semantic)' },
    { file: '../components/ai/ai-code-block.tsx', line: 42, reason: 'icon-only insert button' },
    { file: '../components/connection/connection-status-indicator.tsx', line: 6, reason: 'status dot background fill for the disconnected state, not text' },
    { file: '../components/connection/connection-export-dialog.tsx', line: 137, reason: 'decorative Lock icon' },
    { file: '../components/connection/ConnectionGroupSection.tsx', line: 77, reason: 'icon-only expand/collapse chevron button' },
    { file: '../components/connection/ConnectionGroupSection.tsx', line: 109, reason: 'icon-only menu-trigger button' },
    { file: '../components/editor/EditorTabBar.tsx', line: 243, reason: 'icon-only new-tab button' },
    { file: '../components/editor/explain-panel.tsx', line: 69, reason: 'icon-only close button' },
    { file: '../components/filter/quick-search-bar.tsx', line: 95, reason: 'icon-only clear button' },
    { file: '../components/grid/grid-header.tsx', line: 98, reason: 'decorative chevron, visible only on hover' },
    { file: '../components/history/HistoryPanel.tsx', line: 87, reason: 'decorative Clock icon' },
    { file: '../components/history/HistoryPanel.tsx', line: 92, reason: 'icon-only clear-all button, hover to red (semantic danger)' },
    { file: '../components/history/HistoryPanel.tsx', line: 138, reason: 'icon-only copy button, hover to blue (semantic)' },
    { file: '../components/inspector/field-row.tsx', line: 94, reason: 'icon-only copy button, hover to primary; named by its title attribute' },
    { file: '../components/history/HistoryPanel.tsx', line: 152, reason: 'icon-only delete button, hover to red (semantic danger)' },
    { file: '../components/layout/sidebar-object-group.tsx', line: 29, reason: 'decorative chevron icon' },
    { file: '../components/layout/sidebar-object-group.tsx', line: 31, reason: 'decorative chevron icon' },
    { file: '../components/layout/sidebar-object-group.tsx', line: 33, reason: 'decorative group-type icon' },
    { file: '../components/layout/run-split-button.tsx', line: 194, reason: 'decorative leading icon' },
    { file: '../components/layout/sidebar-table-node.tsx', line: 160, reason: 'decorative chevron icon' },
    { file: '../components/layout/sidebar-table-node.tsx', line: 162, reason: 'decorative chevron icon' },
    { file: '../components/layout/StatusBar.tsx', line: 65, reason: 'status dot background fill, not text' },
    { file: '../components/layout/Toolbar.tsx', line: 215, reason: 'icon-only disconnect button, hover to accent-red (semantic danger)' },
    { file: '../components/procedures/sidebar-routine-node.tsx', line: 75, reason: 'decorative routine-kind glyph' },
  ];

  it('every remaining text-muted line is disabled, decorative, or explicitly allowed', () => {
    const allowedSet = new Set(ALLOWED.map((a) => `${a.file}:${a.line}`));
    const offenders: string[] = [];

    for (const [path, text] of Object.entries(SOURCES)) {
      if (!path.endsWith('.tsx') && !path.endsWith('.ts')) continue;
      if (path.includes('__tests__') || path.includes('.test.')) continue;
      text.split('\n').forEach((line, i) => {
        if (!line.includes('text-muted') && !line.includes('text-[var(--color-text-muted)]')) return;
        if (line.includes('disabled') || line.includes('aria-hidden')) return;
        if (allowedSet.has(`${path}:${i + 1}`)) return;
        offenders.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-list itself still matches real, current source lines', () => {
    for (const entry of ALLOWED) {
      const text = lines(entry.file)[entry.line - 1];
      expect(text, `${entry.file}:${entry.line} — ${entry.reason}`).toBeDefined();
      expect(
        text.includes('text-muted') || text.includes('text-[var(--color-text-muted)]'),
        `${entry.file}:${entry.line} no longer carries text-muted — remove this stale allow-list entry`,
      ).toBe(true);
    }
  });
});

describe('M10 — hover:bg-surface-hover / hover:bg-surface-muted pair with primary text', () => {
  // A container whose hover background is set here, but whose visible text
  // lives entirely on children already at text-primary (or, on bg-muted
  // specifically, at text-secondary — AA-compliant there per design-spec
  // 5.2's own numbers, unlike bg-hover) — plus controls that intentionally
  // hover to a semantic action colour instead of primary.
  const ALLOWED: Array<{ file: string; line: number; reason: string }> = [
    { file: '../components/grid/grid-header.tsx', line: 82, reason: 'header cell container; name is already primary, type carries its own group-hover:text-primary' },
    { file: '../components/history/HistoryPanel.tsx', line: 129, reason: 'entry row container; query text already renders at text-primary' },
    { file: '../components/connection/connection-export-dialog.tsx', line: 109, reason: 'row container; name already primary, host:port carries group-hover:text-primary' },
    { file: '../components/connection/ConnectionGroupSection.tsx', line: 74, reason: 'group header container; name already primary, count carries group-hover:text-primary' },
    { file: '../components/editor/explain-node.tsx', line: 24, reason: 'row container; operation name already primary, detail at text-secondary (AA-compliant on bg-muted)' },
    { file: '../components/history/HistoryPanel.tsx', line: 92, reason: 'icon-only clear-all button, hover to red (semantic danger), not primary' },
    { file: '../components/layout/Sidebar.tsx', line: 274, reason: 'row container; connection name already renders at text-primary' },
    { file: '../components/layout/Sidebar.tsx', line: 304, reason: 'row container; connection name already renders at text-primary' },
    { file: '../components/layout/Sidebar.tsx', line: 328, reason: 'row container; connection name already renders at text-primary' },
    { file: '../components/layout/Toolbar.tsx', line: 202, reason: 'icon-only reconnect button, hover to accent-yellow (semantic warning), not primary' },
    { file: '../components/layout/Toolbar.tsx', line: 215, reason: 'icon-only disconnect button, hover to accent-red (semantic danger), not primary' },
    { file: '../components/grid/bulk-delete-dialog.tsx', line: 181, reason: 'icon-only remove-filter button, hover to accent-red (semantic danger), not primary' },
  ];

  it('every remaining hover-bg line pairs with primary text or is explicitly allowed', () => {
    const allowedSet = new Set(ALLOWED.map((a) => `${a.file}:${a.line}`));
    const offenders: string[] = [];

    for (const [path, text] of Object.entries(SOURCES)) {
      if (!path.endsWith('.tsx')) continue;
      if (path.includes('__tests__') || path.includes('.test.')) continue;
      text.split('\n').forEach((line, i) => {
        if (!line.includes('hover:bg-surface-hover') && !line.includes('hover:bg-surface-muted')) return;
        // Covers both an unconditional `text-text-primary` rest colour and a
        // `hover:text-text-primary` / `group-hover:text-text-primary` rule.
        if (line.includes('text-text-primary')) return;
        if (allowedSet.has(`${path}:${i + 1}`)) return;
        offenders.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-list itself still matches real, current source lines', () => {
    for (const entry of ALLOWED) {
      const text = lines(entry.file)[entry.line - 1];
      expect(text, `${entry.file}:${entry.line} — ${entry.reason}`).toBeDefined();
      expect(
        text.includes('hover:bg-surface-hover') || text.includes('hover:bg-surface-muted'),
        `${entry.file}:${entry.line} no longer carries a hover-bg rule — remove this stale allow-list entry`,
      ).toBe(true);
    }
  });
});
