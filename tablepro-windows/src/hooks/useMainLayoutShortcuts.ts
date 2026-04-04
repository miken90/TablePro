import { useEffect } from "react";
import { useLayoutStore } from "../stores/layoutStore";
import {
  COMMAND_DEFINITIONS,
  useShortcutStore,
  bindingToKey,
} from "./useCommandRegistry";

/**
 * Convert a KeyboardEvent into the same canonical key format used by bindingToKey.
 */
function eventToBindingKey(e: KeyboardEvent): string {
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

// Build a map of commandId -> action for layout shortcuts
const LAYOUT_ACTIONS: Record<string, () => void> = {
  'nav.quickSwitcher': () => {
    const ls = useLayoutStore.getState();
    ls.setQuickSwitcherOpen(!ls.quickSwitcherOpen);
  },
  'app.settings': () => useLayoutStore.getState().setSettingsOpen(true),
  'nav.toggleAiChat': () => useLayoutStore.getState().toggleAiChat(),
  'nav.toggleInspector': () => useLayoutStore.getState().toggleInspector(),
  'nav.toggleHistory': () => useLayoutStore.getState().toggleHistory(),
  'app.help': () => useLayoutStore.getState().setHelpOpen(true),
  'nav.commandPalette': () => {
    const ls = useLayoutStore.getState();
    ls.setCommandPaletteOpen(!ls.commandPaletteOpen);
  },
};

// Commands handled by this hook
const HANDLED_COMMAND_IDS = Object.keys(LAYOUT_ACTIONS);

export function useMainLayoutShortcuts() {
  const userBindings = useShortcutStore((s) => s.userBindings);

  useEffect(() => {
    // Build bindingKey -> commandId map for the commands we handle
    const bindingMap = new Map<string, string>();
    for (const def of COMMAND_DEFINITIONS) {
      if (!HANDLED_COMMAND_IDS.includes(def.id)) continue;
      const binding = userBindings[def.id] ?? def.defaultBinding;
      bindingMap.set(bindingToKey(binding), def.id);
    }

    const handler = (e: KeyboardEvent) => {
      const eventKey = eventToBindingKey(e);
      const commandId = bindingMap.get(eventKey);
      if (commandId) {
        e.preventDefault();
        LAYOUT_ACTIONS[commandId]();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [userBindings]);
}
