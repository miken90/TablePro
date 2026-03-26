import { useEffect } from "react";
import { resolveActiveQuerySessionId, useQueryStore } from "../stores/queryStore";
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
  onInsertRow?: () => void;
  onImportSql?: () => void;
  onShowHelp?: () => void;
  onRefreshTable?: () => void;
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
      const sessionId = resolveActiveQuerySessionId();

      // Ctrl+Enter — run query
      if (ctrl && e.key === "Enter") {
        if (handlers?.onRunQuery) {
          handlers.onRunQuery();
        } else if (!isExecuting && sessionId) {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (tab?.content.trim()) {
            void execute(sessionId, tab.content);
          }
        }
      }

      // Escape — cancel query
      if (e.key === "Escape" && isExecuting && sessionId) {
        void cancel(sessionId);
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

      // F5 — refresh table (if in table mode) or refresh schema
      if (e.key === "F5") {
        e.preventDefault();
        handlers?.onRefreshTable?.();
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

      // Ctrl+I — insert new row
      if (ctrl && e.key === "i" && !e.shiftKey) {
        e.preventDefault();
        handlers?.onInsertRow?.();
      }

      // Ctrl+Tab — next tab / Ctrl+Shift+Tab — previous tab
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const setActiveTab = useEditorStore.getState().setActiveTab;
        if (e.shiftKey) {
          const prev = idx > 0 ? idx - 1 : tabs.length - 1;
          if (tabs[prev]) setActiveTab(tabs[prev].id);
        } else {
          const next = idx < tabs.length - 1 ? idx + 1 : 0;
          if (tabs[next]) setActiveTab(tabs[next].id);
        }
      }

      // Ctrl+Shift+M — import SQL (placeholder for Phase 4)
      if (ctrl && e.shiftKey && e.key === "M") {
        e.preventDefault();
        handlers?.onImportSql?.();
      }

      // F1 — show keyboard shortcuts help
      if (e.key === "F1") {
        e.preventDefault();
        handlers?.onShowHelp?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    execute, cancel, isExecuting, selectedConnectionId, getSessionId,
    activeTabId, tabs, addTab, closeTab, fetchSchema, handlers,
  ]);
}
