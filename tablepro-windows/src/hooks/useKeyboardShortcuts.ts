import { useEffect, useCallback } from "react";
import { useTabStore } from "../stores/tabs";
import { useAppStore } from "../stores/app";

export interface ShortcutAction {
  key: string;
  label: string;
  category: "Editor" | "Navigation" | "Data Grid" | "General";
  handler: () => void;
}

interface UseKeyboardShortcutsOptions {
  onRunQuery?: () => void;
  onRunAll?: () => void;
  onFormatSql?: () => void;
  onRefresh?: () => void;
  onShowShortcuts?: () => void;
}

export const DEFAULT_SHORTCUTS: {
  key?: string;
  ctrl?: boolean;
  shift?: boolean;
  code?: string;
  label: string;
  display: string;
  category: "Editor" | "Navigation" | "Data Grid" | "General";
  action: string;
}[] = [
  { key: "Enter", ctrl: true, label: "Run Current Query", display: "Ctrl+Enter", category: "Editor", action: "runQuery" },
  { key: "Enter", ctrl: true, shift: true, label: "Run All Queries", display: "Ctrl+Shift+Enter", category: "Editor", action: "runAll" },
  { key: "s", ctrl: true, label: "Save Changes", display: "Ctrl+S", category: "Editor", action: "save" },
  { key: "z", ctrl: true, label: "Undo", display: "Ctrl+Z", category: "Editor", action: "undo" },
  { key: "y", ctrl: true, label: "Redo", display: "Ctrl+Y", category: "Editor", action: "redo" },
  { key: "F", ctrl: true, shift: true, label: "Format SQL", display: "Ctrl+Shift+F", category: "Editor", action: "formatSql" },
  { key: "t", ctrl: true, label: "New Tab", display: "Ctrl+T", category: "Navigation", action: "newTab" },
  { key: "w", ctrl: true, label: "Close Tab", display: "Ctrl+W", category: "Navigation", action: "closeTab" },
  { key: "Tab", ctrl: true, label: "Next Tab", display: "Ctrl+Tab", category: "Navigation", action: "nextTab" },
  { key: "Tab", ctrl: true, shift: true, label: "Previous Tab", display: "Ctrl+Shift+Tab", category: "Navigation", action: "prevTab" },
  { key: "f", ctrl: true, label: "Find in Editor", display: "Ctrl+F", category: "Editor", action: "find" },
  { key: "d", ctrl: true, label: "Duplicate Row", display: "Ctrl+D", category: "Data Grid", action: "duplicateRow" },
  { code: "F5", label: "Refresh", display: "F5", category: "General", action: "refresh" },
  { key: "?", ctrl: true, label: "Keyboard Shortcuts", display: "Ctrl+?", category: "General", action: "showShortcuts" },
  { code: "F1", label: "Keyboard Shortcuts", display: "F1", category: "General", action: "showShortcuts" },
];

export function useKeyboardShortcuts({
  onRunQuery,
  onRunAll,
  onFormatSql,
  onRefresh,
  onShowShortcuts,
}: UseKeyboardShortcutsOptions) {
  const addTab = useTabStore((s) => s.addTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);

  const handleNextTab = useCallback(() => {
    if (tabs.length === 0 || !activeTabId) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    if (next) setActiveTab(next.id);
  }, [tabs, activeTabId, setActiveTab]);

  const handlePrevTab = useCallback(() => {
    if (tabs.length === 0 || !activeTabId) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    if (prev) setActiveTab(prev.id);
  }, [tabs, activeTabId, setActiveTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // F5 — refresh
      if (e.code === "F5") {
        e.preventDefault();
        onRefresh?.();
        return;
      }

      // F1 — show shortcuts
      if (e.code === "F1") {
        e.preventDefault();
        onShowShortcuts?.();
        return;
      }

      if (!ctrl) return;

      // Ctrl+Shift combos
      if (shift) {
        if (e.key === "Enter") {
          e.preventDefault();
          onRunAll?.();
          return;
        }
        if (e.key === "F" || e.key === "f") {
          e.preventDefault();
          onFormatSql?.();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          handlePrevTab();
          return;
        }
        if (e.key === "?") {
          e.preventDefault();
          onShowShortcuts?.();
          return;
        }
      }

      // Ctrl combos (no shift)
      switch (e.key) {
        case "t":
          e.preventDefault();
          if (activeConnectionId) addTab(activeConnectionId, null);
          break;
        case "w":
          e.preventDefault();
          if (activeTabId) closeTab(activeTabId);
          break;
        case "Tab":
          e.preventDefault();
          handleNextTab();
          break;
        case "s":
          e.preventDefault();
          // Save handled by editor/grid components
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeConnectionId,
    activeTabId,
    addTab,
    closeTab,
    handleNextTab,
    handlePrevTab,
    onRunQuery,
    onRunAll,
    onFormatSql,
    onRefresh,
    onShowShortcuts,
  ]);
}
