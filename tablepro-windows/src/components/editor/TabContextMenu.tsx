import { useEffect, useRef } from "react";
import type { EditorTab } from "../../stores/editorStore";
import { useEditorStore } from "../../stores/editorStore";

interface TabContextMenuProps {
  tab: EditorTab;
  position: { x: number; y: number };
  onClose: () => void;
}

export function TabContextMenu({ tab, position, onClose }: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const pinTab = useEditorStore((s) => s.pinTab);
  const unpinTab = useEditorStore((s) => s.unpinTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight);

  // Dismiss on click outside or Escape
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Clamp to viewport so menu never appears off-screen
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: position.y,
    left: position.x,
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="min-w-[180px] rounded border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        onClick={() => {
          (tab.isPinned ?? false) ? unpinTab(tab.id) : pinTab(tab.id);
          onClose();
        }}
      >
        {(tab.isPinned ?? false) ? "Unpin Tab" : "Pin Tab"}
      </MenuItem>

      <Separator />

      <MenuItem
        onClick={() => {
          closeTab(tab.id);
          onClose();
        }}
      >
        Close
      </MenuItem>

      <MenuItem
        onClick={() => {
          closeOtherTabs(tab.id);
          onClose();
        }}
      >
        Close Others
      </MenuItem>

      <MenuItem
        onClick={() => {
          closeAllTabs();
          onClose();
        }}
      >
        Close All
      </MenuItem>

      <Separator />

      <MenuItem
        onClick={() => {
          closeTabsToRight(tab.id);
          onClose();
        }}
      >
        Close to the Right
      </MenuItem>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />;
}
