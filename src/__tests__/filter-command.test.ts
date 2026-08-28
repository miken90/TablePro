/**
 * Q8/D2 — `nav.toggleFilter` is a real registry command bound to Ctrl+Alt+F,
 * dispatches to `layoutStore.toggleFilter`, and collides with nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_DEFINITIONS,
  useCommandStore,
  findBindingConflict,
  type Command,
} from '../hooks/useCommandRegistry';
import { createShortcutHandler } from '../hooks/useMainLayoutShortcuts';

function register(partial: Partial<Command> & { id: string; action: () => void }) {
  useCommandStore.getState().registerCommand({
    label: partial.id,
    category: 'Navigation',
    ...partial,
  } as Command);
}

beforeEach(() => {
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
});

describe('nav.toggleFilter', () => {
  it('is defined with the Ctrl+Alt+F binding', () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === 'nav.toggleFilter');
    expect(def).toBeDefined();
    expect(def!.defaultBinding).toEqual(['Ctrl', 'Alt', 'F']);
    expect(def!.category).toBe('Navigation');
  });

  it('collides with no other command binding', () => {
    expect(findBindingConflict('nav.toggleFilter', ['Ctrl', 'Alt', 'F'], {})).toBeNull();
  });

  it('dispatches for the Ctrl+Alt+F chord when a handler is registered', () => {
    const action = vi.fn();
    register({ id: 'nav.toggleFilter', action });
    const dispatch = createShortcutHandler({});

    const dispatched = dispatch({
      key: 'f',
      ctrlKey: true,
      shiftKey: false,
      altKey: true,
      metaKey: false,
      defaultPrevented: false,
      preventDefault() {},
    });

    expect(dispatched).toBe('nav.toggleFilter');
    expect(action).toHaveBeenCalledTimes(1);
  });
});
