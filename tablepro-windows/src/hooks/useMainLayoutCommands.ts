import { useEffect } from "react";
import { useLayoutStore } from "../stores/layoutStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../stores/queryStore";
import { useEditorStore } from "../stores/editorStore";
import { useCommandStore, COMMAND_DEFINITIONS } from "./useCommandRegistry";

/** Look up display shortcut string for a command ID from the registry. */
function shortcutFor(id: string): string | undefined {
  const def = COMMAND_DEFINITIONS.find((d) => d.id === id);
  return def ? def.defaultBinding.join("+") : undefined;
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
        id: "editor.formatSql",
        label: "Format SQL",
        shortcut: shortcutFor("editor.formatSql"),
        category: "Query" as const,
        action: () => window.dispatchEvent(new CustomEvent("tablepro:format-sql")),
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
