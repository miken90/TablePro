/**
 * There is exactly one Ctrl+Z / Ctrl+Y listener for staged grid edits.
 *
 * There used to be two — `change-toolbar.tsx` and `contextual-bar.tsx` — and
 * whenever both were mounted a single Ctrl+Z undid two edits. Counting the
 * listeners as source text is the only check that stays true when a third one
 * is added in a component nobody thought to look at.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/src/components/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`/src/components/${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('undo/redo keyboard ownership', () => {
  it('exactly one file under components/ pairs a keydown listener with a z check', () => {
    const owners = Object.entries(SOURCES)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, text]) => text.includes("addEventListener('keydown'") || text.includes('addEventListener("keydown"'))
      .filter(([, text]) => /e\.key === ['"]z['"]/.test(text))
      .map(([path]) => path);

    expect(owners).toEqual(['/src/components/grid/hooks/use-undo-redo-shortcuts.ts']);
  });

  it('the hook is mounted above the tab-kind switch', () => {
    const body = source('layout/workspace-body.tsx');
    expect(body).toContain('useUndoRedoShortcuts');
    // Called before `switch (view.kind)`, so a structure tab keeps it alive.
    expect(body.indexOf('useUndoRedoShortcuts()')).toBeLessThan(body.indexOf('switch (view.kind)'));
  });

  it('it stays out of the way of typing', () => {
    expect(source('grid/hooks/use-undo-redo-shortcuts.ts')).toContain('isTextEntryTarget(e.target)');
  });

  it('it survives undoing the last change, so Redo still works', () => {
    // `hasChanges` would be false there; the hook keys off the stacks instead.
    const hook = source('grid/hooks/use-undo-redo-shortcuts.ts');
    expect(hook).toContain('s._undoStack.length > 0 || s._redoStack.length > 0');
    expect(hook).not.toContain('s.hasChanges');
  });

  it('the old change toolbar is gone', () => {
    expect(SOURCES['/src/components/grid/change-toolbar.tsx']).toBeUndefined();
  });
});
