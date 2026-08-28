/**
 * Q2 — SCR-23 carries row actions only.
 *
 * The staged-change actions used to live here as well as in the (unreachable)
 * change toolbar, which is how the app ended up with two Execute buttons and
 * two undo listeners. They now belong to the pending-changes strip, and this
 * pins them there.
 *
 * P8 (Q9) moved the FilterPanel host and filter toggle out of this bar and
 * into the single workspace-level mount, toggled only from the status bar.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`/src/${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('contextual bar', () => {
  const bar = () => source('components/grid/contextual-bar.tsx');

  it('has no staged-change actions left', () => {
    const text = bar();
    expect(text).not.toContain('changeToolbar.executeCount');
    expect(text).not.toContain('ConfirmDiscardDialog');
    expect(text).not.toMatch(/\bundo\b/i);
    expect(text).not.toMatch(/\bredo\b/i);
  });

  it('no longer takes an onSave prop, and no caller passes one', () => {
    expect(bar()).not.toContain('onSave');
    expect(source('components/layout/workspace-body.tsx')).not.toContain('onSave={');
  });

  it('keeps add row, delete selected and deselect all', () => {
    const text = bar();
    expect(text).toContain('onAddRow');
    expect(text).toContain('onDeleteSelected');
    expect(text).toContain('onDeselectAll');
  });

  it('no longer hosts a FilterPanel — that moved to the single workspace mount', () => {
    expect(bar()).not.toContain('<FilterPanel');
  });
});
