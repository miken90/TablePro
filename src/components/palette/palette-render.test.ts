// @vitest-environment jsdom
/**
 * What the palette actually renders (M5): `role="dialog" aria-modal="true"`,
 * no scrim, and a command row's shortcut chip that tracks a live rebind.
 *
 * `renderToStaticMarkup` cannot be used here: `paletteOpen` defaults to
 * `false`, and React's server-render path reads zustand's `getServerSnapshot`
 * (the store's state *at module load*) rather than the live state a
 * `setState` would otherwise produce — so a static render could never
 * observe the palette open, let alone a rebind changing it mid-render. This
 * needs a live client mount (`createRoot` + `act`), matching the lesson from
 * Phase 4's own journal entry.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Palette } from './palette';
import { useLayoutStore } from '../../stores/layoutStore';
import { useCommandStore, useShortcutStore, type Command } from '../../hooks/useCommandRegistry';
import { __setInvokeImpl, __resetInvokeImpl } from '../../__tests__/mocks/tauri';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useShortcutStore.setState({ userBindings: {} });
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
  useLayoutStore.setState({ paletteOpen: false, paletteSeedMode: 'objects' });
  // The palette fetches recent history on open; the mock `invoke` otherwise
  // resolves `null`, which crashes `buildObjectResults`' `.slice(0, 20)`.
  __setInvokeImpl(async () => []);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  __resetInvokeImpl();
});

/** Renders open and flushes the async `fetchRecent()` the open effect fires. */
async function renderOpen(mode: 'objects' | 'commands') {
  act(() => {
    useLayoutStore.getState().openPalette(mode);
  });
  await act(async () => {
    root.render(createElement(Palette, { onSelectTable: () => {} }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('Palette rendering', () => {
  it('renders nothing while closed', () => {
    act(() => {
      root.render(createElement(Palette, { onSelectTable: () => {} }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('role="dialog" aria-modal="true", no scrim, when open', async () => {
    await renderOpen('objects');
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(container.innerHTML).not.toMatch(/bg-black\//);
  });

  it('Ctrl+Shift+P seeds the chip; Ctrl+K opens with none', async () => {
    await renderOpen('commands');
    expect(container.querySelector('input')?.getAttribute('placeholder')).toBe('Type a command…');

    await renderOpen('objects');
    expect(container.querySelector('input')?.getAttribute('placeholder')).not.toBe('Type a command…');
  });

  it("a command row's chip prints the live binding, and re-renders after a rebind [RT-14]", async () => {
    act(() => {
      useCommandStore.getState().registerCommand({
        id: 'nav.toggleHistory',
        label: 'Toggle History',
        category: 'Navigation',
        action: () => {},
      } as Command);
    });
    await renderOpen('commands');

    expect(container.textContent).toContain('Ctrl+H');

    act(() => {
      useShortcutStore.getState().setBinding('nav.toggleHistory', ['Ctrl', 'Alt', 'Y']);
    });

    expect(container.textContent).toContain('Ctrl+Alt+Y');
    expect(container.textContent).not.toContain('Ctrl+H');
  });

  it('Backspace on an empty command-mode input drops the chip', async () => {
    await renderOpen('commands');
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('Type a command…');

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    });

    expect(input.placeholder).not.toBe('Type a command…');
  });

  it('footer shows the navigate/select/close legend and a result count', async () => {
    await renderOpen('objects');
    const footerText = container.textContent ?? '';
    expect(footerText).toMatch(/navigate/);
    expect(footerText).toMatch(/close/);
    expect(footerText).toMatch(/\d+ results?/);
  });
});
