import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "../stores/layoutStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../stores/queryStore";
import { useEditorStore } from "../stores/editorStore";
import { requestCloseTab } from "../stores/active-tab-sync";
import { useConnectionStore } from "../stores/connectionStore";
import { refreshActiveSchema } from "../stores/schemaStore";
import { useCommandStore, getEffectiveBinding, type Command } from "./useCommandRegistry";

/** Look up display shortcut string for a command ID from the registry. */
function shortcutFor(id: string): string | undefined {
  const binding = getEffectiveBinding(id);
  return binding ? binding.join("+") : undefined;
}

/** Minimal shape of i18next's `t` — keeps the builder usable outside React. */
type Translate = (key: string) => string;

/**
 * The commands the main layout owns, as data.
 *
 * Built as a pure function so each action can be invoked in a test and checked
 * for an actual effect. The previous reachability test only asserted that a
 * command id appeared somewhere in this file, which passed happily for actions
 * that dispatched a window event nothing listened for.
 */
export function buildMainLayoutCommands(t: Translate): Command[] {
  return [
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
      id: "editor.cancel",
      label: "Cancel Query",
      shortcut: shortcutFor("editor.cancel"),
      category: "Query" as const,
      // `when` keeps Escape inert unless a query is actually running, so it
      // never competes with the Escape handling in dialogs and popovers.
      when: () => useQueryStore.getState().isExecuting,
      // The store owns the target: it cancels the run that is actually in
      // flight, on the session that started it, and refuses to guess when
      // several tabs are running and none is focused.
      action: () => {
        void useQueryStore.getState().cancel().then((outcome) => {
          if (outcome === "ambiguous") {
            useQueryStore.setState({ error: t("toolbar.cancelAmbiguous") });
          }
        });
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
      // Through the tab bar's guard, so Ctrl+W asks about a dirty query or
      // staged row edits exactly like the tab's own close control does.
      action: () => {
        const { activeTabId: tid } = useEditorStore.getState();
        if (tid) requestCloseTab(tid);
      },
    },
    {
      id: "data.importSql",
      label: "Import SQL",
      shortcut: shortcutFor("data.importSql"),
      category: "Edit" as const,
      // The dialog is rendered by ConnectedLayout, which needs an active
      // session. Setting the flag while disconnected did nothing visible and
      // left it true, so the dialog sprang open on the next connect.
      when: () => !!resolveActiveQuerySessionId(),
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
      id: "app.about",
      label: "About TablePro",
      shortcut: shortcutFor("app.about"),
      category: "Settings" as const,
      action: () => useLayoutStore.getState().setAboutOpen(true),
    },
    {
      id: "app.refreshSchema",
      label: "Refresh Schema",
      shortcut: shortcutFor("app.refreshSchema"),
      category: "Settings" as const,
      // Calls the store directly. This used to dispatch a window event no
      // listener ever handled, so the palette entry did nothing.
      when: () => !!useConnectionStore.getState().selectedConnectionId,
      action: () => {
        refreshActiveSchema();
      },
    },
  ];
}

export function useMainLayoutCommands() {
  const registerCommand = useCommandStore((s) => s.registerCommand);
  const { t } = useTranslation();

  useEffect(() => {
    buildMainLayoutCommands(t).forEach(registerCommand);
  }, [registerCommand, t]);
}
