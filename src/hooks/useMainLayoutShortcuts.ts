import { useEffect } from "react";
import {
  COMMAND_DEFINITIONS,
  useCommandStore,
  useShortcutStore,
  bindingToKey,
} from "./useCommandRegistry";

/**
 * The application's single global keyboard dispatcher.
 *
 * Bindings come from the command registry (including the user's stored
 * overrides), and the action comes from whichever component registered a
 * handler for that command in the `CommandStore`. That indirection is what
 * lets context-owning components — the result panel, for instance — supply
 * handlers for commands this hook knows nothing about, without a second
 * dispatcher.
 *
 * A command with no registered handler is deliberately left alone: the key
 * falls through untouched rather than being swallowed by a no-op.
 */

/**
 * Commands the CodeMirror keymap owns (`src/editor/keybindings.ts`).
 *
 * They need the editor view to do anything useful, and CodeMirror does not
 * stop propagation after handling a key — so dispatching them here as well
 * would run them twice whenever the editor has focus. They stay editor-scoped
 * and are documented as such.
 */
const EDITOR_OWNED_COMMAND_IDS = new Set([
  "editor.run",
  "editor.explain",
  "editor.formatSql",
  "editor.toggleComment",
  "app.refreshSchema",
]);

/** Minimal shape of the key event the dispatcher needs. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
}

/** Convert a key event into the canonical key format used by bindingToKey. */
function eventToBindingKey(e: ShortcutKeyEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  // Normalize the key value to match our display strings
  let key = e.key;
  if (key === ' ') key = 'Space';
  // Don't add modifier keys themselves as the key part
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
    parts.push(key.toLowerCase());
  }

  return parts.sort((a, b) => {
    const order = ['ctrl', 'meta', 'alt', 'shift'];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  }).join('+');
}

/** Command ids this hook will dispatch, given a registered handler. */
export function isGloballyDispatchable(commandId: string): boolean {
  return !EDITOR_OWNED_COMMAND_IDS.has(commandId);
}

/**
 * Build the keydown handler for a given set of user overrides.
 *
 * Exported so the dispatch decision can be exercised directly in tests: the
 * hook body itself only wires this to `window`.
 */
export function createShortcutHandler(
  userBindings: Record<string, string[]>,
): (e: ShortcutKeyEvent) => string | null {
  // Binding -> commandId, honouring the user's overrides.
  const bindingMap = new Map<string, string>();
  for (const def of COMMAND_DEFINITIONS) {
    if (!isGloballyDispatchable(def.id)) continue;
    const binding = userBindings[def.id] ?? def.defaultBinding;
    bindingMap.set(bindingToKey(binding), def.id);
  }

  /** Returns the command id it dispatched, or null if the key was left alone. */
  return (e: ShortcutKeyEvent): string | null => {
    const commandId = bindingMap.get(eventToBindingKey(e));
    if (!commandId) return null;

    const store = useCommandStore.getState();
    const command = store.commands.find((c) => c.id === commandId);
    // No handler registered, or not applicable right now (e.g. Escape with
    // no query running): leave the key for whoever else wants it. Dialogs
    // keep their own Escape handling this way.
    if (!command) return null;
    if (command.when && !command.when()) return null;

    e.preventDefault();
    store.executeCommand(commandId);
    return commandId;
  };
}

export function useMainLayoutShortcuts() {
  const userBindings = useShortcutStore((s) => s.userBindings);

  useEffect(() => {
    const dispatch = createShortcutHandler(userBindings);
    const handler = (e: KeyboardEvent) => { dispatch(e); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [userBindings]);
}
