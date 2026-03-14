import { useEffect } from "react";
import { useQueryStore } from "../stores/queryStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useEditorStore } from "../stores/editorStore";
import { useSchemaStore } from "../stores/schemaStore";

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
}

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Enter — run query
      if (ctrl && e.key === "Enter") {
        if (handlers?.onRunQuery) {
          handlers.onRunQuery();
        } else if (selectedConnectionId && !isExecuting) {
          const sessionId = getSessionId(selectedConnectionId);
          if (!sessionId) return;
          const tab = tabs.find((t) => t.id === activeTabId);
          if (tab?.content.trim()) {
            void execute(sessionId, tab.content);
          }
        }
      }

      // Escape — cancel query
      if (e.key === "Escape" && isExecuting && selectedConnectionId) {
        const sessionId = getSessionId(selectedConnectionId);
        if (sessionId) void cancel(sessionId);
      }

      // Ctrl+T — new tab
      if (ctrl && e.key === "t") {
        e.preventDefault();
        handlers?.onNewTab ? handlers.onNewTab() : addTab();
      }

      // Ctrl+W — close current tab
      if (ctrl && e.key === "w") {
        e.preventDefault();
        if (handlers?.onCloseTab) {
          handlers.onCloseTab();
        } else if (activeTabId) {
          closeTab(activeTabId);
        }
      }

      // Ctrl+S — save changes
      if (ctrl && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handlers?.onSave?.();
      }

      // Ctrl+Shift+F — format SQL
      if (ctrl && e.shiftKey && e.key === "F") {
        e.preventDefault();
        handlers?.onFormatSql?.();
      }

      // F5 — refresh schema
      if (e.key === "F5") {
        e.preventDefault();
        if (handlers?.onRefreshSchema) {
          handlers.onRefreshSchema();
        } else if (selectedConnectionId) {
          const sessionId = getSessionId(selectedConnectionId);
          if (sessionId) void fetchSchema(sessionId);
        }
      }

      // Ctrl+, — open settings
      if (ctrl && e.key === ",") {
        e.preventDefault();
        handlers?.onOpenSettings?.();
      }

      // Ctrl+Shift+E — toggle sidebar
      if (ctrl && e.shiftKey && e.key === "E") {
        e.preventDefault();
        handlers?.onToggleSidebar?.();
      }

      // Ctrl+K — quick switcher
      if (ctrl && e.key === "k") {
        e.preventDefault();
        handlers?.onQuickSwitcher?.();
      }

      // Ctrl+N — new tab (alternative)
      if (ctrl && e.key === "n") {
        e.preventDefault();
        handlers?.onNewTab ? handlers.onNewTab() : addTab();
      }

      // Ctrl+/ — toggle line comment
      if (ctrl && e.key === "/") {
        e.preventDefault();
        handlers?.onToggleComment?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    execute, cancel, isExecuting, selectedConnectionId, getSessionId,
    activeTabId, tabs, addTab, closeTab, fetchSchema, handlers,
  ]);
}
