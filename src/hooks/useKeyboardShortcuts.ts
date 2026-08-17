import { useEffect } from "react";
import { resolveActiveQuerySessionId, useQueryStore } from "../stores/queryStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useEditorStore } from "../stores/editorStore";
import { useSchemaStore } from "../stores/schemaStore";
import {
  COMMAND_DEFINITIONS,
  useShortcutStore,
  bindingToKey,
} from "./useCommandRegistry";

// Bindings here must match COMMAND_DEFINITIONS in useCommandRegistry.ts.
// This hook handles editor/tab/data keydown events; the registry is the
// source of truth for IDs, labels, and display text.

/**
 * Convert a KeyboardEvent into the same canonical key format used by bindingToKey.
 */
function eventToBindingKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  let key = e.key;
  if (key === ' ') key = 'Space';
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

interface ShortcutHandlers {
  onRunQuery?: () => void;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onSave?: () => void;
  onFormatSql?: () => void;
  onRefreshSchema?: () => void;
  onOpenSettings?: () => void;
  onToggleSidebar?: () => void;
  onQuickSwitcher?: () => void;
  onToggleComment?: () => void;
  onAbout?: () => void;
  onInsertRow?: () => void;
  onImportSql?: () => void;
  onShowHelp?: () => void;
  onRefreshTable?: () => void;
}

// Commands handled by this hook and their handler keys
const COMMAND_HANDLER_MAP: Record<string, keyof ShortcutHandlers | null> = {
  'editor.run': 'onRunQuery',
  'editor.cancel': null, // special handling
  'editor.formatSql': 'onFormatSql',
  'editor.toggleComment': 'onToggleComment',
  'tabs.new': 'onNewTab',
  'tabs.close': 'onCloseTab',
  'tabs.next': null, // special handling
  'tabs.prev': null, // special handling
  'data.save': 'onSave',
  'data.insertRow': 'onInsertRow',
  'data.importSql': 'onImportSql',
  'nav.quickSwitcher': 'onQuickSwitcher',
  'nav.toggleSidebar': 'onToggleSidebar',
  'app.settings': 'onOpenSettings',
  'app.refreshSchema': 'onRefreshSchema',
  'app.help': 'onShowHelp',
};

const HANDLED_IDS = Object.keys(COMMAND_HANDLER_MAP);

export function useKeyboardShortcuts(handlers?: ShortcutHandlers) {
  const execute = useQueryStore((s) => s.execute);
  const cancel = useQueryStore((s) => s.cancel);
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const fetchSchema = useSchemaStore((s) => s.fetchSchema);
  const userBindings = useShortcutStore((s) => s.userBindings);

  useEffect(() => {
    // Build bindingKey -> commandId map
    const bindingMap = new Map<string, string>();
    for (const def of COMMAND_DEFINITIONS) {
      if (!HANDLED_IDS.includes(def.id)) continue;
      const binding = userBindings[def.id] ?? def.defaultBinding;
      bindingMap.set(bindingToKey(binding), def.id);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const eventKey = eventToBindingKey(e);
      const commandId = bindingMap.get(eventKey);
      if (!commandId) return;

      const sessionId = resolveActiveQuerySessionId();

      // Special-case commands that need more than simple handler dispatch
      switch (commandId) {
        case 'editor.run':
          if (handlers?.onRunQuery) {
            handlers.onRunQuery();
          } else if (!isExecuting && sessionId) {
            const tab = tabs.find((t) => t.id === activeTabId);
            if (tab?.content.trim()) {
              void execute(sessionId, tab.content);
            }
          }
          return;

        case 'editor.cancel':
          if (isExecuting && sessionId) {
            void cancel(sessionId);
          }
          return;

        case 'tabs.new':
          e.preventDefault();
          if (handlers?.onNewTab) { handlers.onNewTab(); } else { addTab(); }
          return;

        case 'tabs.close':
          e.preventDefault();
          if (handlers?.onCloseTab) {
            handlers.onCloseTab();
          } else if (activeTabId) {
            closeTab(activeTabId);
          }
          return;

        case 'tabs.next':
        case 'tabs.prev': {
          e.preventDefault();
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const setActiveTab = useEditorStore.getState().setActiveTab;
          if (commandId === 'tabs.prev') {
            const prev = idx > 0 ? idx - 1 : tabs.length - 1;
            if (tabs[prev]) setActiveTab(tabs[prev].id);
          } else {
            const next = idx < tabs.length - 1 ? idx + 1 : 0;
            if (tabs[next]) setActiveTab(tabs[next].id);
          }
          return;
        }

        case 'app.refreshSchema': {
          e.preventDefault();
          handlers?.onRefreshTable?.();
          if (handlers?.onRefreshSchema) {
            handlers.onRefreshSchema();
          } else if (selectedConnectionId) {
            const sid = getSessionId(selectedConnectionId);
            if (sid) void fetchSchema(sid);
          }
          return;
        }

        default: {
          // Generic handler dispatch
          e.preventDefault();
          const handlerKey = COMMAND_HANDLER_MAP[commandId];
          if (handlerKey && handlers?.[handlerKey]) {
            handlers[handlerKey]!();
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    execute, cancel, isExecuting, selectedConnectionId, getSessionId,
    activeTabId, tabs, addTab, closeTab, fetchSchema, handlers, userBindings,
  ]);
}
