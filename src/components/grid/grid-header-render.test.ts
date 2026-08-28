// @vitest-environment jsdom
/**
 * M7 — the column header prints name and type on separate lines so a
 * truncated name never hides the type, and the type never regresses to the
 * B2-banned text-muted token.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import '../../i18n';
import { GridHeader } from './grid-header';
import type { ColumnInfo } from '../../types/query';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root && container) {
    act(() => root!.unmount());
    container.remove();
  }
  root = null;
  container = null;
});

const COLUMN: ColumnInfo = { name: 'user_id', typeName: 'text', nullable: false, isPrimaryKey: true };

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(GridHeader, {
        columns: [COLUMN],
        columnWidths: { user_id: 120 },
        sorting: [],
        onSortChange: () => {},
        onResizeStart: () => {},
      }),
    );
  });
  return container;
}

describe('GridHeader render', () => {
  it('renders the column name and type in separate elements', () => {
    const el = mount();
    const nameEl = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === 'user_id');
    const typeEl = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === 'text');
    expect(nameEl).toBeDefined();
    expect(typeEl).toBeDefined();
    expect(nameEl).not.toBe(typeEl);
    expect(nameEl!.contains(typeEl!)).toBe(false);
    expect(typeEl!.contains(nameEl!)).toBe(false);
  });

  it('the type element uses the secondary text token, not text-muted', () => {
    const el = mount();
    const typeEl = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === 'text');
    expect(typeEl).toBeDefined();
    expect(typeEl!.className).toContain('text-text-secondary');
    expect(typeEl!.className).not.toContain('text-text-muted');
  });
});
