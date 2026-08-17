import { useEffect } from "react";
import { useLayoutStore } from "../stores/layoutStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../stores/queryStore";
import { useEditorStore } from "../stores/editorStore";
import { useCommandStore, getEffectiveBinding } from "./useCommandRegistry";

/** Look up display shortcut string for a command ID from the registry. */
function shortcutFor(id: string): string | undefined {
  const binding = getEffectiveBinding(id);
  return binding ? binding.join("+") : undefined;
}

export function useMainLayoutCommands() {
  const registerCommand = useCommandStore((s) => s.registerCommand);

  useEffect(() => {
    const cmds = [
      {
        id: "nav.toggleSidebar",
        label: "Toggle Sidebar",
        shortcut: shortcutFor("nav.toggleSidebar"),
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().toggleSidebar(),
      },
      {
        id: "app.settings",
        label: "Settings",
        shortcut: shortcutFor("app.settings"),
        category: "Settings" as const,
        action: () => useLayoutStore.getState().setSettingsOpen(true),
      },
      {
        id: "nav.quickSwitcher",
        label: "Quick Switcher",
        shortcut: shortcutFor("nav.quickSwitcher"),
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().setQuickSwitcherOpen(!useLayoutStore.getState().quickSwitcherOpen),
      },
      {
        id: "nav.toggleHistory",
        label: "Toggle History",
        shortcut: shortcutFor("nav.toggleHistory"),
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().toggleHistory(),
      },
      {
        id: "nav.toggleAiChat",
        label: "Toggle AI Chat",
        shortcut: shortcutFor("nav.toggleAiChat"),
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().toggleAiChat(),
      },
      {
        id: "nav.toggleInspector",
        label: "Toggle Inspector",
        shortcut: shortcutFor("nav.toggleInspector"),
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().toggleInspector(),
      },
      {
        id: "nav.commandPalette",
        label: "Command Palette",
        shortcut: shortcutFor("nav.commandPalette"),
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().setCommandPaletteOpen(!useLayoutStore.getState().commandPaletteOpen),
      },
      {
        id: "editor.run",
        label: "Run Query",
        shortcut: shortcutFor("editor.run"),
        category: "Query" as const,
        action: () => {
          const { queryText } = useQueryStore.getState();
          const sid = resolveActiveQuerySessionId();
          if (sid) void useQueryStore.getState().execute(sid, queryText);
        },
      },
      {
        id: "editor.explain",
        label: "Explain Query",
        shortcut: shortcutFor("editor.explain"),
        category: "Query" as const,
        action: () => {
          const { queryText } = useQueryStore.getState();
          const sid = resolveActiveQuerySessionId();
          if (sid && queryText.trim()) void useQueryStore.getState().runExplain(sid, queryText);
        },
      },
      {
        id: "editor.formatSql",
        label: "Format SQL",
        shortcut: shortcutFor("editor.formatSql"),
        category: "Query" as const,
        action: () => window.dispatchEvent(new CustomEvent("tablepro:format-sql")),
      },
      {
        id: "editor.cancel",
        label: "Cancel Query",
        shortcut: shortcutFor("editor.cancel"),
        category: "Query" as const,
        // `when` keeps Escape inert unless a query is actually running, so it
        // never competes with the Escape handling in dialogs and popovers.
        when: () => useQueryStore.getState().isExecuting,
        // The store owns the target: it cancels the run that is actually in
        // flight, on the session that started it.
        action: () => {
          void useQueryStore.getState().cancel();
        },
      },
      {
        id: "tabs.next",
        label: "Next Tab",
        shortcut: shortcutFor("tabs.next"),
        category: "Edit" as const,
        when: () => useEditorStore.getState().tabs.length > 1,
        action: () => {
          const { tabs, activeTabId, setActiveTab } = useEditorStore.getState();
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const next = tabs[idx < tabs.length - 1 ? idx + 1 : 0];
          if (next) setActiveTab(next.id);
        },
      },
      {
        id: "tabs.prev",
        label: "Previous Tab",
        shortcut: shortcutFor("tabs.prev"),
        category: "Edit" as const,
        when: () => useEditorStore.getState().tabs.length > 1,
        action: () => {
          const { tabs, activeTabId, setActiveTab } = useEditorStore.getState();
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const prev = tabs[idx > 0 ? idx - 1 : tabs.length - 1];
          if (prev) setActiveTab(prev.id);
        },
      },
      {
        id: "tabs.new",
        label: "New Tab",
        shortcut: shortcutFor("tabs.new"),
        category: "Edit" as const,
        action: () => useEditorStore.getState().addTab(),
      },
      {
        id: "tabs.close",
        label: "Close Tab",
        shortcut: shortcutFor("tabs.close"),
        category: "Edit" as const,
        action: () => {
          const { activeTabId: tid } = useEditorStore.getState();
          if (tid) useEditorStore.getState().closeTab(tid);
        },
      },
      {
        id: "data.importSql",
        label: "Import SQL",
        shortcut: shortcutFor("data.importSql"),
        category: "Edit" as const,
        // The dialog itself is rendered by ConnectedLayout, which has the
        // active session; it stays closed when nothing is connected.
        action: () => useLayoutStore.getState().setImportOpen(true),
      },
      {
        id: "app.help",
        label: "Keyboard Shortcuts",
        shortcut: shortcutFor("app.help"),
        category: "Settings" as const,
        action: () => useLayoutStore.getState().setHelpOpen(true),
      },
      {
        id: "app.refreshSchema",
        label: "Refresh Schema",
        shortcut: shortcutFor("app.refreshSchema"),
        category: "Settings" as const,
        action: () => {
          // Refresh handled at the hook level where sessionId is available
          window.dispatchEvent(new CustomEvent("tablepro:refresh-schema"));
        },
      },
    ];
    cmds.forEach(registerCommand);
  }, [registerCommand]);
}
