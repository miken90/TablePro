import { Plus } from "lucide-react";
import { useCallback, useMemo, useState, useRef } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import type { EditorTab } from "../../stores/editorStore";
import { EditorTab as EditorTabComponent } from "./EditorTab";
import { TabContextMenu } from "./TabContextMenu";

interface EditorTabBarProps {
  onTabActivate?: () => void;
}

interface ContextMenuState {
  tab: EditorTab;
  position: { x: number; y: number };
}

export function EditorTabBar({ onTabActivate }: EditorTabBarProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const promoteTab = useEditorStore((s) => s.promoteTab);

  const connections = useConnectionStore((s) => s.connections);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

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
        if (next) { setActiveTab(next.id); onTabActivate?.(); }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = sortedTabs[(currentIndex - 1 + sortedTabs.length) % sortedTabs.length];
        if (prev) { setActiveTab(prev.id); onTabActivate?.(); }
      }
    },
    [sortedTabs, activeTabId, setActiveTab, onTabActivate],
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
                setActiveTab(tab.id);
                onTabActivate?.();
              }}
              onDoubleClick={() => {
                if (tab.isPreview) promoteTab(tab.id);
              }}
              onClose={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
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
        />
      )}
    </div>
  );
}
