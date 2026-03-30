import { useEffect } from "react";
import { useLayoutStore } from "../stores/layoutStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../stores/queryStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useEditorStore } from "../stores/editorStore";
import { useCommandStore } from "./useCommandRegistry";

export function useMainLayoutCommands() {
  const registerCommand = useCommandStore((s) => s.registerCommand);

  useEffect(() => {
    const cmds = [
      {
        id: "nav.toggleSidebar",
        label: "Toggle Sidebar",
        shortcut: "Ctrl+B",
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().toggleSidebar(),
      },
      {
        id: "nav.openSettings",
        label: "Open Settings",
        shortcut: "Ctrl+,",
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().setSettingsOpen(true),
      },
      {
        id: "nav.quickSwitcher",
        label: "Quick Switcher",
        shortcut: "Ctrl+K",
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().setQuickSwitcherOpen(!useLayoutStore.getState().quickSwitcherOpen),
      },
      {
        id: "nav.toggleHistory",
        label: "Toggle Query History",
        shortcut: "Ctrl+H",
        category: "Navigation" as const,
        action: () => useLayoutStore.getState().toggleHistory(),
      },
      {
        id: "query.run",
        label: "Run Query",
        shortcut: "Ctrl+Enter",
        category: "Query" as const,
        action: () => {
          const { queryText } = useQueryStore.getState();
          const sid = resolveActiveQuerySessionId();
          if (sid) void useQueryStore.getState().execute(sid, queryText);
        },
      },
      {
        id: "query.formatSql",
        label: "Format SQL",
        shortcut: "Ctrl+Shift+F",
        category: "Query" as const,
        action: () => window.dispatchEvent(new CustomEvent("tablepro:format-sql")),
      },
      {
        id: "edit.newTab",
        label: "New Tab",
        shortcut: "Ctrl+N",
        category: "Edit" as const,
        action: () => useEditorStore.getState().addTab(),
      },
      {
        id: "edit.closeTab",
        label: "Close Tab",
        shortcut: "Ctrl+W",
        category: "Edit" as const,
        action: () => {
          const { activeTabId: tid } = useEditorStore.getState();
          if (tid) useEditorStore.getState().closeTab(tid);
        },
      },
      {
        id: "view.toggleFilterBar",
        label: "Toggle Filter Bar",
        shortcut: "Ctrl+Shift+L",
        category: "View" as const,
        action: () => useLayoutStore.getState().toggleFilter(),
      },
      {
        id: "view.toggleInspector",
        label: "Toggle Inspector",
        shortcut: "Ctrl+Shift+I",
        category: "View" as const,
        action: () => useLayoutStore.getState().toggleInspector(),
      },
    ];
    cmds.forEach(registerCommand);
  }, [registerCommand]);
}
