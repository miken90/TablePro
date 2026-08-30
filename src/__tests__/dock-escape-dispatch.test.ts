// @vitest-environment jsdom
/**
 * The dock's Esc handler must be the LAST claimant of the key, not the first.
 *
 * `RightDock` installs its Esc listener on `window`, and so does the global
 * shortcut dispatcher (`useMainLayoutShortcuts`). Both are bubble-phase
 * listeners on the same target, so the order is registration order — and
 * `RightDock` (rendered by `ConnectedLayout`) mounts inside `MainLayout`,
 * whose effects run *after* its children's. The dock therefore always
 * registers first and always runs first.
 *
 * That is only safe while the dock claims Esc for keys aimed at itself.
 * `editor.cancel` (Cancel Query) is bound to Escape and is dispatched by
 * that same global dispatcher, which bails on `defaultPrevented` — so a dock
 * that `preventDefault`s every Escape kills Cancel Query outright, and the
 * dock is open by default (`dock-store.ts`: `dockOpen: true`).
 *
 * The rule this pins: the dock claims Escape only when focus is inside the
 * dock. Anywhere else the key falls through untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDockEscapeHandler } from '../components/layout/right-dock';
import { createShortcutHandler } from '../hooks/useMainLayoutShortcuts';
import { useShortcutStore, useCommandStore, type Command } from '../hooks/useCommandRegistry';

let dockEl: HTMLDivElement;
let outsideEl: HTMLButtonElement;
let closed: number;
let dockClaimed: boolean | null;
let dispatchedId: string | null;
let teardown: Array<() => void>;

/**
 * Wire the two window listeners in the order the real component tree
 * produces: the dock first (child effect), the dispatcher second (parent).
 */
function installBothListeners(): void {
  const dockHandler = createDockEscapeHandler(
    () => dockEl,
    () => { closed += 1; },
  );
  const windowDockHandler = (e: KeyboardEvent) => { dockClaimed = dockHandler(e); };
  window.addEventListener('keydown', windowDockHandler);
  teardown.push(() => window.removeEventListener('keydown', windowDockHandler));

  const dispatch = createShortcutHandler({});
  const windowDispatchHandler = (e: KeyboardEvent) => { dispatchedId = dispatch(e); };
  window.addEventListener('keydown', windowDispatchHandler);
  teardown.push(() => window.removeEventListener('keydown', windowDispatchHandler));
}

function escapeEvent(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
}

describe('the right dock claims Escape only when focus is inside it', () => {
  beforeEach(() => {
    teardown = [];
    closed = 0;
    dockClaimed = null;
    dispatchedId = null;

    dockEl = document.createElement('div');
    const paneButton = document.createElement('button');
    paneButton.textContent = 'Inspector';
    dockEl.appendChild(paneButton);
    document.body.appendChild(dockEl);

    outsideEl = document.createElement('button');
    outsideEl.textContent = 'somewhere else';
    document.body.appendChild(outsideEl);

    useShortcutStore.setState({ userBindings: {} });
    useCommandStore.setState({ commands: [], recentCommandIds: [] });
    useCommandStore.getState().registerCommand({
      id: 'editor.cancel',
      label: 'Cancel Query',
      category: 'Query',
      action: () => {},
    } as Command);
  });

  afterEach(() => {
    teardown.forEach((fn) => fn());
    dockEl.remove();
    outsideEl.remove();
    useCommandStore.setState({ commands: [], recentCommandIds: [] });
  });

  it('leaves Escape alone when focus is on the document body, so editor.cancel dispatches', () => {
    installBothListeners();

    // Nothing focused — `document.activeElement` is <body>, outside the dock.
    const event = escapeEvent();
    document.body.dispatchEvent(event);

    expect(dockClaimed).toBe(false);
    expect(closed).toBe(0);
    expect(dispatchedId).toBe('editor.cancel');
  });

  it('leaves Escape alone when focus is on a control outside the dock', () => {
    installBothListeners();
    outsideEl.focus();
    expect(document.activeElement).toBe(outsideEl);

    const event = escapeEvent();
    outsideEl.dispatchEvent(event);

    expect(dockClaimed).toBe(false);
    expect(closed).toBe(0);
    expect(dispatchedId).toBe('editor.cancel');
  });

  it('closes the dock when focus is inside it, and keeps the key from the dispatcher', () => {
    installBothListeners();
    const paneButton = dockEl.querySelector('button') as HTMLButtonElement;
    paneButton.focus();
    expect(dockEl.contains(document.activeElement)).toBe(true);

    const event = escapeEvent();
    paneButton.dispatchEvent(event);

    expect(dockClaimed).toBe(true);
    expect(closed).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    // The dock consumed it: Cancel Query must not also fire off one keypress.
    expect(dispatchedId).toBeNull();
  });

  it('leaves Escape alone when the dock element is not rendered', () => {
    // Mirrors `isConnected === false`, where RightDock returns null and the
    // ref is empty — the key must still reach the dispatcher.
    const dockHandler = createDockEscapeHandler(() => null, () => { closed += 1; });
    const windowDockHandler = (e: KeyboardEvent) => { dockClaimed = dockHandler(e); };
    window.addEventListener('keydown', windowDockHandler);
    teardown.push(() => window.removeEventListener('keydown', windowDockHandler));

    const dispatch = createShortcutHandler({});
    const windowDispatchHandler = (e: KeyboardEvent) => { dispatchedId = dispatch(e); };
    window.addEventListener('keydown', windowDispatchHandler);
    teardown.push(() => window.removeEventListener('keydown', windowDispatchHandler));

    const event = escapeEvent();
    document.body.dispatchEvent(event);

    expect(dockClaimed).toBe(false);
    expect(closed).toBe(0);
    expect(dispatchedId).toBe('editor.cancel');
  });

  it('yields to a higher layer that already claimed the key', () => {
    installBothListeners();
    const paneButton = dockEl.querySelector('button') as HTMLButtonElement;
    paneButton.focus();

    // A focus-trapped dialog/palette above the dock calls preventDefault first.
    const event = escapeEvent();
    event.preventDefault();
    paneButton.dispatchEvent(event);

    expect(dockClaimed).toBe(false);
    expect(closed).toBe(0);
    expect(dispatchedId).toBeNull();
  });
});
