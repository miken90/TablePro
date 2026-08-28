import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { makeTableKey, useChangeStore } from "../../stores/changeStore";
import { registerCloseTabHandler } from "../../stores/active-tab-sync";
import type { EditorTab } from "../../stores/editorStore";
import { EditorTab as EditorTabComponent } from "./EditorTab";
import { TabContextMenu, type BulkCloseKind } from "./TabContextMenu";
import { ConfirmDiscardDialog } from "../shared/confirm-discard-dialog";

interface EditorTabBarProps {
  onTabActivate?: () => void;
  /** Return false to prevent switching to the target tab. */
  onBeforeTabSwitch?: (targetTabId: string) => boolean;
  /** Called after a tab is closed, with the newly active tab ID (or null). */
  onAfterClose?: (newActiveTabId: string | null) => void;
}

interface ContextMenuState {
  tab: EditorTab;
  position: { x: number; y: number };
}

export function EditorTabBar({ onTabActivate, onBeforeTabSwitch, onAfterClose }: EditorTabBarProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const promoteTab = useEditorStore((s) => s.promoteTab);

  const connections = useConnectionStore((s) => s.connections);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  /** Staged row edits of a table tab, or 0 for any other tab. */
  const stagedChangesOf = useCallback((tab: EditorTab | undefined): number => {
    if (!tab || tab.type !== "table" || !tab.tableName) return 0;
    const connectionId = tab.connectionId ?? useConnectionStore.getState().selectedConnectionId;
    if (!connectionId) return 0;
    return useChangeStore.getState().stagedChangeCount(connectionId, tab.tableSchema ?? null, tab.tableName);
  }, []);

  /** Drop a table tab's staged snapshot (the Discard half of V3). */
  const clearStagedOf = useCallback((tab: EditorTab | undefined) => {
    if (!tab || tab.type !== "table" || !tab.tableName) return;
    const connectionId = tab.connectionId ?? useConnectionStore.getState().selectedConnectionId;
    if (!connectionId) return;
    useChangeStore.getState().clearForTable(makeTableKey(connectionId, tab.tableSchema ?? null, tab.tableName));
  }, []);

  /** Which tabs a bulk close would remove. Mirrors the editorStore actions. */
  const bulkCloseVictims = useCallback((kind: BulkCloseKind, tabId: string): EditorTab[] => {
    const idx = tabs.findIndex((t) => t.id === tabId);
    // The store's closeTabsToRight no-ops on an unknown anchor; mirror that
    // so no snapshot is cleared for a close that will not happen.
    if (kind === "right" && idx === -1) return [];
    return tabs.filter((t, i) => {
      if (t.isPinned ?? false) return false;
      if (kind === "others") return t.id !== tabId;
      if (kind === "right") return i > idx;
      return true;
    });
  }, [tabs]);

  /** What a close would lose: staged row edits of a table tab, or one unsaved query. */
  const lossOf = useCallback((tab: EditorTab | undefined): number => {
    if (!tab) return 0;
    if (tab.isDirty && (tab.type === "query" || !tab.type)) return 1;
    return stagedChangesOf(tab);
  }, [stagedChangesOf]);

  const [pendingBulkClose, setPendingBulkClose] = useState<{ kind: BulkCloseKind; tabId: string } | null>(null);

  const runBulkClose = useCallback((kind: BulkCloseKind, tabId: string) => {
    const store = useEditorStore.getState();
    if (kind === "others") store.closeOtherTabs(tabId);
    else if (kind === "right") store.closeTabsToRight(tabId);
    else store.closeAllTabs();
    onAfterClose?.(useEditorStore.getState().activeTabId);
  }, [onAfterClose]);

  // Close Others / Close All / Close to the Right: one SCR-45 for every
  // staged edit the bulk close would drop, or straight through when none.
  const handleBulkClose = useCallback((kind: BulkCloseKind, tabId: string) => {
    const loss = bulkCloseVictims(kind, tabId).reduce((n, t) => n + lossOf(t), 0);
    if (loss > 0) {
      setPendingBulkClose({ kind, tabId });
      return;
    }
    runBulkClose(kind, tabId);
  }, [bulkCloseVictims, lossOf, runBulkClose]);

  const confirmBulkDiscard = useCallback(() => {
    if (!pendingBulkClose) return;
    bulkCloseVictims(pendingBulkClose.kind, pendingBulkClose.tabId).forEach(clearStagedOf);
    runBulkClose(pendingBulkClose.kind, pendingBulkClose.tabId);
    setPendingBulkClose(null);
  }, [pendingBulkClose, bulkCloseVictims, clearStagedOf, runBulkClose]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      const dirtyQuery = tab?.isDirty && (tab.type === "query" || !tab.type);
      // A table tab with staged edits prompts too: closing it silently would
      // leave the snapshot behind to resurface on the next open (V3).
      if (dirtyQuery || stagedChangesOf(tab) > 0) {
        setPendingCloseTabId(tabId);
        return;
      }
      closeTab(tabId);
      onAfterClose?.(useEditorStore.getState().activeTabId);
    },
    [tabs, closeTab, onAfterClose, stagedChangesOf],
  );

  const confirmDiscard = useCallback(() => {
    if (pendingCloseTabId) {
      const tab = tabs.find((t) => t.id === pendingCloseTabId);
      if (tab?.type === "table" && tab.tableName) {
        const connectionId = tab.connectionId ?? useConnectionStore.getState().selectedConnectionId;
        if (connectionId) {
          useChangeStore.getState().clearForTable(makeTableKey(connectionId, tab.tableSchema ?? null, tab.tableName));
        }
      }
      closeTab(pendingCloseTabId);
      setPendingCloseTabId(null);
      onAfterClose?.(useEditorStore.getState().activeTabId);
    }
  }, [pendingCloseTabId, tabs, closeTab, onAfterClose]);

  // Commands (Ctrl+W) and vim `:q` close through this same guard.
  useEffect(() => {
    registerCloseTabHandler(handleCloseTab);
    return () => registerCloseTabHandler(null);
  }, [handleCloseTab]);

  const pendingCloseChangeCount = useMemo(() => {
    if (pendingBulkClose) {
      return Math.max(1, bulkCloseVictims(pendingBulkClose.kind, pendingBulkClose.tabId).reduce((n, t) => n + lossOf(t), 0));
    }
    const tab = tabs.find((t) => t.id === pendingCloseTabId);
    return Math.max(1, stagedChangesOf(tab));
  }, [tabs, pendingCloseTabId, pendingBulkClose, bulkCloseVictims, lossOf, stagedChangesOf]);

  // Sort: pinned tabs first, then by original order
  const sortedTabs = useMemo(() => {
    const pinned = tabs.filter((t) => t.isPinned ?? false);
    const normal = tabs.filter((t) => !(t.isPinned ?? false));
    return [...pinned, ...normal];
  }, [tabs]);

  const getConnectionColor = useCallback(
    (connectionId: string | undefined): string | undefined => {
      if (!connectionId) return undefined;
      const conn = connections.get(connectionId);
      return conn?.color ?? undefined;
    },
    [connections],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: EditorTab) => {
      e.preventDefault();
      setContextMenu({ tab, position: { x: e.clientX, y: e.clientY } });
    },
    [],
  );

  /** Arrow key navigation within the tab list */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!sortedTabs.length) return;
      const currentIndex = sortedTabs.findIndex((t) => t.id === activeTabId);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = sortedTabs[(currentIndex + 1) % sortedTabs.length];
        if (next) {
          if (onBeforeTabSwitch && !onBeforeTabSwitch(next.id)) return;
          setActiveTab(next.id); onTabActivate?.();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = sortedTabs[(currentIndex - 1 + sortedTabs.length) % sortedTabs.length];
        if (prev) {
          if (onBeforeTabSwitch && !onBeforeTabSwitch(prev.id)) return;
          setActiveTab(prev.id); onTabActivate?.();
        }
      }
    },
    [sortedTabs, activeTabId, setActiveTab, onTabActivate, onBeforeTabSwitch],
  );

  return (
    <div
      className="flex h-8 items-center border-b border-border-subtle bg-surface"
      role="tablist"
      aria-label="Editor tabs"
      onKeyDown={handleKeyDown}
    >
      {/* Scrollable tab list */}
      <div
        ref={tabListRef}
        className="flex flex-1 items-center overflow-x-auto scroll-smooth"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {sortedTabs.map((tab) => (
          <div
            key={tab.id}
            style={{ scrollSnapAlign: "start" }}
            onContextMenu={(e) => handleContextMenu(e, tab)}
          >
            <EditorTabComponent
              tab={tab}
              isActive={tab.id === activeTabId}
              connectionColor={getConnectionColor(tab.connectionId)}
              onClick={() => {
                if (onBeforeTabSwitch && !onBeforeTabSwitch(tab.id)) return;
                setActiveTab(tab.id);
                onTabActivate?.();
              }}
              onDoubleClick={() => {
                if (tab.isPreview) promoteTab(tab.id);
              }}
              onClose={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id);
              }}
            />
          </div>
        ))}
      </div>

      {/* New tab button */}
      <button
        onClick={() => {
          addTab();
          onTabActivate?.();
        }}
        className="flex h-full items-center px-2 text-text-muted hover:bg-surface-muted hover:text-text-primary"
        title="New tab"
        aria-label="Open new tab"
      >
        <Plus size={13} aria-hidden="true" />
      </button>

      {/* Context menu portal */}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCloseTab={handleCloseTab}
          onBulkClose={handleBulkClose}
        />
      )}

      {/* Confirm discard unsaved query dialog */}
      <ConfirmDiscardDialog
        open={pendingCloseTabId !== null || pendingBulkClose !== null}
        changeCount={pendingCloseChangeCount}
        onConfirm={pendingBulkClose ? confirmBulkDiscard : confirmDiscard}
        onCancel={() => { setPendingCloseTabId(null); setPendingBulkClose(null); }}
      />
    </div>
  );
}
