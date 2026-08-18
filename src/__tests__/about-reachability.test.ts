/**
 * The About box has an entry point.
 *
 * It shipped as a complete component that nothing rendered and no command
 * opened. These tests cover the whole chain: the shortcut dispatches the
 * command, the command opens the store flag, and the overlay region renders
 * the dialog off that same flag.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMMAND_DEFINITIONS } from '../hooks/useCommandRegistry';
import { createShortcutHandler } from '../hooks/useMainLayoutShortcuts';
import { useCommandStore } from '../hooks/useCommandRegistry';
import { useLayoutStore } from '../stores/layoutStore';
import { AboutDialog } from '../components/shared/about-dialog';
import pkg from '../../package.json';

// `__APP_VERSION__` is injected by Vite's `define` at build time; the test
// runner does not apply it, so stand in the same value the build would.
declare global {
  var __APP_VERSION__: string;
}
globalThis.__APP_VERSION__ = pkg.version;

const OVERLAY_SOURCE = import.meta.glob('../components/layout/OverlayRegion.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

beforeEach(() => {
  useLayoutStore.getState().setAboutOpen(false);
});

describe('app.about command', () => {
  it('is defined with its own binding', () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === 'app.about');
    expect(def).toBeDefined();
    expect(def?.defaultBinding.length).toBeGreaterThan(0);
  });

  it('opens the dialog when its shortcut is pressed', () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === 'app.about');
    const action = vi.fn(() => useLayoutStore.getState().setAboutOpen(true));
    useCommandStore.getState().registerCommand({
      id: 'app.about',
      label: 'About TablePro',
      category: 'Settings',
      action,
    });

    const handler = createShortcutHandler({});
    const event = {
      key: 'F1',
      ctrlKey: false,
      shiftKey: (def?.defaultBinding ?? []).includes('Shift'),
      altKey: false,
      metaKey: false,
      preventDefault: () => {},
    };

    expect(handler(event as unknown as KeyboardEvent & { preventDefault: () => void })).toBe(
      'app.about',
    );
    expect(action).toHaveBeenCalled();
    expect(useLayoutStore.getState().aboutOpen).toBe(true);

    useCommandStore.getState().unregisterCommand('app.about');
  });
});

describe('AboutDialog rendering', () => {
  it('renders the build version, not a hardcoded one', () => {
    const html = renderToStaticMarkup(
      createElement(AboutDialog, { open: true, onClose: () => {} }),
    );
    expect(html).toContain('TablePro');
    expect(html).toContain(__APP_VERSION__);
    expect(html).not.toContain('0.1.0');
  });

  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(
      createElement(AboutDialog, { open: false, onClose: () => {} }),
    );
    expect(html).toBe('');
  });

  it('links nowhere — the dialog makes no external claims', () => {
    const html = renderToStaticMarkup(
      createElement(AboutDialog, { open: true, onClose: () => {} }),
    );
    expect(html).not.toContain('<a ');
    // The only http in the markup is the SVG namespace on the close icon.
    expect(html).not.toMatch(/href=["']https?:/);
  });
});

describe('OverlayRegion mounts it', () => {
  const source = Object.values(OVERLAY_SOURCE)[0] as string;

  it('lazily imports the dialog', () => {
    expect(source).toContain('import("../shared/about-dialog")');
  });

  it('renders it from the same store flag the command sets', () => {
    expect(source).toContain('s.aboutOpen');
    expect(source).toMatch(/\{aboutOpen && \(/);
    expect(source).toContain('<AboutDialog');
    expect(source).toContain('setAboutOpen(false)');
  });
});
