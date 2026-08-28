// @vitest-environment jsdom
/**
 * D1 — locks the JS semantics of Ctrl+Shift+I versus the PROD devtools
 * blocker, independent of what a real WebView2 build reports.
 *
 * The blocker (`main.tsx:14-21`) is a `document`-level listener; it is
 * mirrored here rather than imported, since importing `main.tsx` would also
 * boot the React root. `createShortcutHandler` (`useMainLayoutShortcuts.ts`)
 * is the real, unmodified window-level dispatcher.
 *
 * A keydown dispatched inside `document` bubbles target → … → document →
 * window (DOM Events §"event path"), so a `document` listener always runs
 * before a `window` listener for the same event. That ordering — not
 * registration order — is what this test pins down.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createShortcutHandler } from '../hooks/useMainLayoutShortcuts';
import { useShortcutStore } from '../hooks/useCommandRegistry';
import { useCommandStore, type Command } from '../hooks/useCommandRegistry';

/** Mirrors main.tsx:14-21's PROD-only document listener. */
function installProdDevtoolsBlocker(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key))) {
      e.preventDefault();
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

function ctrlShiftI(): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'I',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
}

describe('D1: Inspector shortcut vs. the PROD devtools blocker', () => {
  beforeEach(() => {
    useShortcutStore.setState({ userBindings: {} });
    useCommandStore.setState({ commands: [], recentCommandIds: [] });
    useCommandStore.getState().registerCommand({
      id: 'nav.toggleInspector',
      label: 'Toggle Inspector',
      category: 'Navigation',
      action: () => {},
    } as Command);
  });

  it('the document-level PROD blocker runs first and suppresses the window dispatcher', () => {
    const uninstallBlocker = installProdDevtoolsBlocker();
    let dispatchedId: string | null = null;
    const dispatch = createShortcutHandler({});
    const windowHandler = (e: KeyboardEvent) => {
      dispatchedId = dispatch(e);
    };
    window.addEventListener('keydown', windowHandler);

    try {
      const event = ctrlShiftI();
      document.body.dispatchEvent(event);

      // The blocker already claimed it by the time the dispatcher runs.
      expect(event.defaultPrevented).toBe(true);
      expect(dispatchedId).toBeNull();
    } finally {
      window.removeEventListener('keydown', windowHandler);
      uninstallBlocker();
    }
  });

  it('without the blocker (dev build), the same key reaches the dispatcher', () => {
    let dispatchedId: string | null = null;
    const dispatch = createShortcutHandler({});
    const windowHandler = (e: KeyboardEvent) => {
      dispatchedId = dispatch(e);
    };
    window.addEventListener('keydown', windowHandler);

    try {
      const event = ctrlShiftI();
      document.body.dispatchEvent(event);

      expect(dispatchedId).toBe('nav.toggleInspector');
    } finally {
      window.removeEventListener('keydown', windowHandler);
    }
  });

  afterEach(() => {
    useCommandStore.setState({ commands: [], recentCommandIds: [] });
  });
});
