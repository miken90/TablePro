// @vitest-environment jsdom
/**
 * Regression proof for the selection-bar layout shift: selecting/deselecting
 * rows must never add or remove a sibling row above the grid. `ResultToolbar`
 * is the always-present row the selection controls now render inside, so
 * mounting it with 0 and with 2 selected rows must produce the exact same
 * DOM shape — only the text inside changes.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import '../../i18n';
import { ResultToolbar } from './result-toolbar';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const BASE_PROPS = {
  activeTab: 'results' as const,
  onTabChange: () => {},
  result: null,
  error: null,
  isTableMode: true,
  total: 0,
  onExport: () => {},
};

async function mount(selectedRowCount: number) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(ResultToolbar, {
        ...BASE_PROPS,
        selectedRowCount,
        onDeleteSelected: () => {},
        onDeselectAll: () => {},
      }),
    );
  });
  return container;
}

describe('ResultToolbar selection controls', () => {
  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('renders a single root row with 0 rows selected, and no selection controls', async () => {
    const el = await mount(0);
    expect(el.children).toHaveLength(1);
    expect(el.querySelector('[role="tablist"]')).not.toBeNull();
    expect(el.textContent).not.toMatch(/rows? selected/i);
    expect(el.textContent).not.toContain('Delete');
    expect(el.textContent).not.toContain('Deselect');
  });

  it('renders the same single root row with 2 rows selected, controls inline inside it', async () => {
    const el = await mount(2);
    // Same DOM shape as the 0-selected case: exactly one child, same root tag.
    expect(el.children).toHaveLength(1);
    const root0 = el.children[0]!;
    expect(root0.getAttribute('role')).toBe('tablist');

    // Selection controls exist, and are descendants of that one row — not a
    // second, conditional sibling that would push the grid below it down.
    expect(root0.textContent).toContain('2 rows selected');
    expect(root0.querySelector('button[title^="Delete"]')).not.toBeNull();
    expect(root0.querySelector('button[title="Deselect all"]')).not.toBeNull();
  });
});
