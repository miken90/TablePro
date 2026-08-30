// @vitest-environment jsdom
/**
 * Double-clicking a data cell must not slide the grid sideways.
 *
 * Focusing an element makes the browser scroll it into view, and a grid cell
 * lives inside a horizontally scrollable container. On a table wider than the
 * viewport a partly-clipped cell therefore dragged the whole view across the
 * moment its editor mounted. `preventScroll` is what suppresses that.
 *
 * jsdom implements neither scroll-on-focus nor layout, so the assertion is on
 * the call itself rather than on a resulting `scrollLeft`.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { CellEditor } from './cell-editor';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(props: Record<string, unknown>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(CellEditor, {
        value: 'a3f1c0de-0000-4000-8000-000000000000',
        columnName: 'id',
        typeName: 'varchar',
        onCommit: () => {},
        onCancel: () => {},
        ...props,
      } as never),
    );
  });
}

afterEach(() => {
  if (root && container) {
    act(() => root!.unmount());
    container.remove();
  }
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('cell editor focus', () => {
  let focusSpy: ReturnType<typeof vi.spyOn>;
  let selectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
    selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');
  });

  it('does not let the browser scroll the grid when opened by double-click', () => {
    mount({ trigger: 'click' });

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('still focuses the editor when opened by double-click', () => {
    mount({ trigger: 'click' });

    const input = container!.querySelector('input');
    expect(input).not.toBeNull();
    expect(focusSpy).toHaveBeenCalled();
    // Click-opened editors deliberately leave the caret where the user
    // clicked rather than selecting the whole value.
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('keeps focus and select-all for the keyboard path', () => {
    mount({ trigger: 'keyboard' });

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('does not scroll on focus for the keyboard path either, since the grid scrolls the active cell itself', () => {
    mount({ trigger: 'keyboard' });

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});

/**
 * The foreign-key editor focuses its own search input on a code path that
 * needs a live session to reach, so guard every cell editor at the source
 * instead of only the one this suite can mount.
 */
describe('cell editor sources', () => {
  const SOURCES = import.meta.glob('./*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  const editors = ['cell-editor.tsx', 'foreign-key-cell-editor.tsx'];

  it.each(editors)('%s focuses without scrolling', (file) => {
    const source = SOURCES[`./${file}`];
    if (source === undefined) throw new Error(`source not found: ${file}`);

    const bare = [...source.matchAll(/\.focus\((.*?)\)/g)].filter(
      (m) => !m[1].includes('preventScroll'),
    );

    expect(
      bare.map((m) => m[0]),
      `${file} focuses an element without preventScroll, which lets the browser scroll the grid`,
    ).toEqual([]);
  });
});
