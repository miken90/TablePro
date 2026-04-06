import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { RoutineInfo } from "../../types/schema";

interface ContextMenuState {
  x: number;
  y: number;
}

interface SidebarRoutineNodeProps {
  routine: RoutineInfo;
  onExecute: (routine: RoutineInfo) => void;
  onViewSource: (routine: RoutineInfo) => void;
}

export function SidebarRoutineNode({
  routine,
  onExecute,
  onViewSource,
}: SidebarRoutineNodeProps) {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCopyName = () => {
    navigator.clipboard.writeText(routine.name);
    setContextMenu(null);
  };

  const handleExecute = () => {
    onExecute(routine);
    setContextMenu(null);
  };

  const handleViewSource = () => {
    onViewSource(routine);
    setContextMenu(null);
  };

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onViewSource(routine);
    },
    [routine, onViewSource],
  );

  const icon = routine.kind === "function" ? "ƒ" : "\u25B6";

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        className="flex cursor-pointer items-center gap-1.5 px-6 py-1 text-xs text-text-secondary hover:bg-surface-muted"
        title={routine.signature ? `${routine.name}(${routine.signature})` : routine.name}
      >
        <span className="w-3 shrink-0 text-center text-[10px] text-text-muted">{icon}</span>
        <span className="truncate">{routine.name}</span>
      </div>

      {contextMenu && (
        <div
          ref={contextRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded border border-border bg-surface-elevated py-0.5 shadow-lg"
        >
          <button
            onClick={handleExecute}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs font-medium"
          >
            {t("procedures.execute")}
          </button>
          <button
            onClick={handleViewSource}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs"
          >
            {t("procedures.viewSource")}
          </button>
          <div className="my-0.5 border-t border-border" />
          <button
            onClick={handleCopyName}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs"
          >
            {t("procedures.copyName")}
          </button>
        </div>
      )}
    </>
  );
}
