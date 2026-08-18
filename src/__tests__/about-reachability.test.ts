/**
 * The About box has an entry point.
 *
 * It shipped as a complete component that nothing rendered and no command
 * opened. These tests cover the wiring: the shortcut dispatches the command,
 * the command opens the store flag, and the overlay region renders the dialog
 * off that same flag. What the dialog itself renders is covered by
 * `about-dialog-render.test.ts`, which needs a DOM.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_DEFINITIONS } from '../hooks/useCommandRegistry';
import { createShortcutHandler } from '../hooks/useMainLayoutShortcuts';
import { useCommandStore } from '../hooks/useCommandRegistry';
import { useLayoutStore } from '../stores/layoutStore';

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
