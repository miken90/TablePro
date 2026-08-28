import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { EditorTab } from "../../stores/editorStore";
import { useEditorStore } from "../../stores/editorStore";
import { Menu, MenuDivider, MenuItem } from "../ui";

interface TabContextMenuProps {
  tab: EditorTab;
  position: { x: number; y: number };
  onClose: () => void;
  /** Intercept close to allow confirm-discard for dirty tabs. */
  onCloseTab?: (tabId: string) => void;
  /** Intercept bulk closes so staged table edits get the same confirm (V3). */
  onBulkClose?: (kind: BulkCloseKind, tabId: string) => void;
}

export type BulkCloseKind = "others" | "all" | "right";

/** SCR-07 — per-tab lifecycle commands on the canonical `Menu`. */
export function TabContextMenu({ tab, position, onClose, onCloseTab, onBulkClose }: TabContextMenuProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  // A context menu closes on a click anywhere else; the kit Menu only owns Esc.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  const pinTab = useEditorStore((s) => s.pinTab);
  const unpinTab = useEditorStore((s) => s.unpinTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div
      ref={rootRef}
      style={{ position: "fixed", top: position.y, left: position.x }}
      className="z-popover"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Menu open onClose={onClose}>
        <MenuItem onSelect={run(() => ((tab.isPinned ?? false) ? unpinTab(tab.id) : pinTab(tab.id)))}>
          {(tab.isPinned ?? false) ? t("tabContextMenu.unpinTab") : t("tabContextMenu.pinTab")}
        </MenuItem>
        <MenuDivider />
        <MenuItem onSelect={run(() => (onCloseTab ? onCloseTab(tab.id) : closeTab(tab.id)))}>
          {t("tabContextMenu.close")}
        </MenuItem>
        <MenuItem onSelect={run(() => (onBulkClose ? onBulkClose("others", tab.id) : closeOtherTabs(tab.id)))}>
          {t("tabContextMenu.closeOthers")}
        </MenuItem>
        <MenuItem onSelect={run(() => (onBulkClose ? onBulkClose("all", tab.id) : closeAllTabs()))}>
          {t("tabContextMenu.closeAll")}
        </MenuItem>
        <MenuDivider />
        <MenuItem onSelect={run(() => (onBulkClose ? onBulkClose("right", tab.id) : closeTabsToRight(tab.id)))}>
          {t("tabContextMenu.closeToRight")}
        </MenuItem>
      </Menu>
    </div>
  );
}
