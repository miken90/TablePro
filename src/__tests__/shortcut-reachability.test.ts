/**
 * Keyboard shortcut reachability.
 *
 * `src/hooks/useKeyboardShortcuts.ts` was a complete second dispatcher that
 * nothing imported, so every shortcut only it implemented — Escape to cancel a
 * query, the tab shortcuts, Ctrl+I — was silently dead while still being
 * documented. These tests pin the invariants that would have caught that:
 *
 *   1. Exactly one global dispatcher exists and is mounted.
 *   2. Every registry command is either dispatchable with a registered
 *      handler, or explicitly owned by the editor keymap.
 *   3. The dispatcher actually fires the command a binding maps to, honours
 *      user rebindings, and leaves unhandled keys alone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_DEFINITIONS,
  useCommandStore,
  type Command,
} from '../hooks/useCommandRegistry';
import {
  createShortcutHandler,
  isGloballyDispatchable,
  type ShortcutKeyEvent,
} from '../hooks/useMainLayoutShortcuts';

const SOURCES = import.meta.glob('../{hooks,components}/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`../${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

/** Build a synthetic key event from a binding like ["Ctrl","Shift","M"]. */
function keyEvent(binding: string[]): ShortcutKeyEvent & { defaultPrevented: boolean } {
  const mods = binding.map((b) => b.toLowerCase());
  const main = binding.find((b) => !['ctrl', 'shift', 'alt', 'meta'].includes(b.toLowerCase()));
  const e = {
    key: main ?? '',
    ctrlKey: mods.includes('ctrl'),
    shiftKey: mods.includes('shift'),
    altKey: mods.includes('alt'),
    metaKey: mods.includes('meta'),
    defaultPrevented: false,
    preventDefault() { e.defaultPrevented = true; },
  };
  return e;
}

function register(partial: Partial<Command> & { id: string; action: () => void }) {
  useCommandStore.getState().registerCommand({
    label: partial.id,
    category: 'Edit',
    ...partial,
  } as Command);
}

beforeEach(() => {
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
});

describe('a single global dispatcher', () => {
  it('has no second dispatcher left in the tree', () => {
    // The dead hook is gone; anything re-introducing it should fail here.
    expect(() => source('hooks/useKeyboardShortcuts.ts')).toThrow();
  });

  it('is mounted by MainLayout and listens on window', () => {
    const dispatcher = source('hooks/useMainLayoutShortcuts.ts');
    expect(dispatcher).toContain('window.addEventListener("keydown"');
    expect(source('components/layout/MainLayout.tsx')).toContain('useMainLayoutShortcuts()');
  });
});

describe('every registry command is reachable', () => {
  // Commands the CodeMirror keymap owns; they are editor-scoped by design.
  const EDITOR_OWNED = ['editor.run', 'editor.explain', 'editor.formatSql', 'editor.toggleComment', 'app.refreshSchema'];

  it('classifies editor-owned commands as not globally dispatchable', () => {
    for (const id of EDITOR_OWNED) {
      expect(isGloballyDispatchable(id)).toBe(false);
    }
  });

  it('registers a handler for every globally dispatchable command', () => {
    // Handlers registered by useMainLayoutCommands (global context)...
    const globalHandlers = source('hooks/useMainLayoutCommands.ts');
    // ...and by result-panel (table-browse context).
    const gridHandlers = source('components/grid/result-panel.tsx');
    const registered = globalHandlers + gridHandlers;

    const missing = COMMAND_DEFINITIONS
      .filter((d) => isGloballyDispatchable(d.id))
      .filter((d) => !registered.includes(`'${d.id}'`) && !registered.includes(`"${d.id}"`))
      .map((d) => d.id);

    expect(missing).toEqual([]);
  });

  it('accounts for every command exactly once', () => {
    const editorOwned = COMMAND_DEFINITIONS.filter((d) => !isGloballyDispatchable(d.id));
    expect(editorOwned.map((d) => d.id).sort()).toEqual([...EDITOR_OWNED].sort());
    expect(COMMAND_DEFINITIONS).toHaveLength(21);
  });
});

describe('dispatch behaviour', () => {
  it('fires the command a default binding maps to', () => {
    const action = vi.fn();
    register({ id: 'nav.toggleHistory', action });
    const dispatch = createShortcutHandler({});

    const e = keyEvent(['Ctrl', 'H']);
    expect(dispatch(e)).toBe('nav.toggleHistory');
    expect(action).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('leaves the key alone when no handler is registered', () => {
    const dispatch = createShortcutHandler({});
    const e = keyEvent(['Ctrl', 'H']);
    // Nothing registered this run.
    expect(dispatch(e)).toBeNull();
    expect(e.defaultPrevented).toBe(false);
  });

  it('respects a when guard without swallowing the key', () => {
    const action = vi.fn();
    register({ id: 'data.save', action, when: () => false });
    const dispatch = createShortcutHandler({});

    const e = keyEvent(['Ctrl', 'S']);
    expect(dispatch(e)).toBeNull();
    expect(action).not.toHaveBeenCalled();
    // Critical: a blocked command must not preventDefault, or it would break
    // the browser/native behaviour of that key.
    expect(e.defaultPrevented).toBe(false);
  });

  it('honours a user rebinding instead of the default', () => {
    const action = vi.fn();
    register({ id: 'nav.toggleHistory', action });
    const dispatch = createShortcutHandler({ 'nav.toggleHistory': ['Ctrl', 'Alt', 'Y'] });

    expect(dispatch(keyEvent(['Ctrl', 'H']))).toBeNull();
    expect(dispatch(keyEvent(['Ctrl', 'Alt', 'Y']))).toBe('nav.toggleHistory');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('never dispatches an editor-owned command globally', () => {
    const action = vi.fn();
    register({ id: 'editor.run', action });
    const dispatch = createShortcutHandler({});
    // Ctrl+Enter belongs to the CodeMirror keymap; dispatching here too would
    // run the query twice whenever the editor has focus.
    expect(dispatch(keyEvent(['Ctrl', 'Enter']))).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
});

describe('Escape cancels a running query', () => {
  it('fires editor.cancel while a query is executing', () => {
    const cancel = vi.fn();
    let executing = true;
    register({ id: 'editor.cancel', action: cancel, when: () => executing });
    const dispatch = createShortcutHandler({});

    const e = keyEvent(['Escape']);
    expect(dispatch(e)).toBe('editor.cancel');
    expect(cancel).toHaveBeenCalledTimes(1);

    // ...and stays inert when nothing is running, so dialogs keep their Escape.
    executing = false;
    const e2 = keyEvent(['Escape']);
    expect(dispatch(e2)).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(e2.defaultPrevented).toBe(false);
  });

  it('is wired to the query store cancel path', () => {
    const cmds = source('hooks/useMainLayoutCommands.ts');
    expect(cmds).toContain('id: "editor.cancel"');
    expect(cmds).toContain('useQueryStore.getState().cancel(sessionId)');
    expect(cmds).toContain('useQueryStore.getState().isExecuting');
  });
});
