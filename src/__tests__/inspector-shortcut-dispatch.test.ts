// @vitest-environment jsdom
/**
 * D1 — locks the JS semantics of the Inspector shortcut versus the PROD
 * devtools blocker, independent of what a real WebView2 build reports.
 *
 * D1 turned out to be a real code defect, not the documentation defect the
 * plan predicted: `useMainLayoutShortcuts.ts`'s `createShortcutHandler`
 * checks `e.defaultPrevented` (added by RT-9 in the phase 2 kit — commit
 * `451cf297`, end of phase 1, has zero occurrences of `defaultPrevented` in
 * that file). The blocker (`main.tsx:14-21`) is a `document`-level listener
 * that calls `preventDefault()` on `Ctrl+Shift+I/J/C`; a keydown bubbles
 * target → … → document → window (DOM Events "event path"), so the
 * `document` blocker always runs before the `window` dispatcher and the
 * dispatcher then sees `defaultPrevented === true` and bails — for any
 * binding on I, J, or C, regardless of which command owns it. That is why
 * `nav.toggleInspector` was rebound to Ctrl+Shift+O (`useCommandRegistry.ts`)
 * rather than narrowing the blocker, which is a deliberate, out-of-scope
 * product decision.
 *
 * The blocker is mirrored here rather than imported from `main.tsx`, since
 * importing it would also boot the React root. `createShortcutHandler` is
 * the real, unmodified window-level dispatcher.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createShortcutHandler } from '../hooks/useMainLayoutShortcuts';
import { useShortcutStore, useCommandStore, getEffectiveBinding, type Command } from '../hooks/useCommandRegistry';

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

/** Build a synthetic keydown for a binding like ["Ctrl","Shift","O"]. */
function keyEventFor(binding: string[]): KeyboardEvent {
  const mods = binding.map((b) => b.toLowerCase());
  const main = binding.find((b) => !['ctrl', 'shift', 'alt', 'meta'].includes(b.toLowerCase()));
  return new KeyboardEvent('keydown', {
    key: main ?? '',
    ctrlKey: mods.includes('ctrl'),
    shiftKey: mods.includes('shift'),
    altKey: mods.includes('alt'),
    metaKey: mods.includes('meta'),
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

  afterEach(() => {
    useCommandStore.setState({ commands: [], recentCommandIds: [] });
  });

  it('historical regression: the blocker still swallows the old Ctrl+Shift+I combo', () => {
    const uninstallBlocker = installProdDevtoolsBlocker();
    let dispatchedId: string | null = null;
    const dispatch = createShortcutHandler({});
    const windowHandler = (e: KeyboardEvent) => {
      dispatchedId = dispatch(e);
    };
    window.addEventListener('keydown', windowHandler);

    try {
      const event = keyEventFor(['Ctrl', 'Shift', 'I']);
      document.body.dispatchEvent(event);

      // The blocker already claimed it by the time the dispatcher runs —
      // this key is dead for any command bound to it, which is exactly why
      // Inspector moved off it rather than the blocker being narrowed.
      expect(event.defaultPrevented).toBe(true);
      expect(dispatchedId).toBeNull();
    } finally {
      window.removeEventListener('keydown', windowHandler);
      uninstallBlocker();
    }
  });

  it("the Inspector's actual effective binding reaches the dispatcher through the PROD blocker", () => {
    const uninstallBlocker = installProdDevtoolsBlocker();
    let dispatchedId: string | null = null;
    const dispatch = createShortcutHandler({});
    const windowHandler = (e: KeyboardEvent) => {
      dispatchedId = dispatch(e);
    };
    window.addEventListener('keydown', windowHandler);

    try {
      const binding = getEffectiveBinding('nav.toggleInspector');
      expect(binding).toBeDefined();
      const event = keyEventFor(binding as string[]);
      document.body.dispatchEvent(event);

      expect(dispatchedId).toBe('nav.toggleInspector');
    } finally {
      window.removeEventListener('keydown', windowHandler);
      uninstallBlocker();
    }
  });
});
