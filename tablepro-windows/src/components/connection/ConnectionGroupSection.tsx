import { useState, useRef, useEffect } from "react";
import { ChevronRight, MoreHorizontal, Pencil, Palette, Trash2 } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionCard } from "./connection-card";
import type { ConnectionGroup, SavedConnection, ConnectionStatus } from "../../types/connection";

const GROUP_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
];

interface Props {
  group: ConnectionGroup;
  connections: SavedConnection[];
  connectingId: string | null;
  getStatus: (id: string) => ConnectionStatus;
  onConnect: (conn: SavedConnection) => void;
  onEdit: (conn: SavedConnection) => void;
  onDelete: () => void;
  onDeleteConnection: (conn: SavedConnection) => void;
  onDuplicateConnection?: (conn: SavedConnection) => void;
}

export function ConnectionGroupSection({
  group, connections, connectingId, getStatus, onConnect, onEdit, onDelete, onDeleteConnection, onDuplicateConnection,
}: Props) {
  const { saveGroup } = useConnectionStore();
  const [collapsed, setCollapsed] = useState(group.collapsed);
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    void saveGroup({ ...group, collapsed: next });
  };

  const handleRename = async () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== group.name) {
      await saveGroup({ ...group, name: trimmed });
    }
    setRenaming(false);
  };

  const handleColorChange = async (color: string) => {
    await saveGroup({ ...group, color });
    setShowColorPicker(false);
    setShowMenu(false);
  };

  return (
    <div className="rounded border border-border">
      {/* Group header */}
      <div
        className="flex cursor-pointer select-none items-center gap-2 rounded-t px-2 py-1.5 hover:bg-surface-muted"
        style={{ borderLeft: `3px solid ${group.color}` }}
      >
        <button onClick={toggleCollapsed} className="text-text-muted hover:text-text-primary">
          <ChevronRight
            size={14}
            className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
          />
        </button>

        {renaming ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => void handleRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename();
              if (e.key === "Escape") { setNameInput(group.name); setRenaming(false); }
            }}
            className="flex-1 rounded border border-accent-blue bg-transparent px-1 text-xs text-text-primary outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-xs font-medium text-text-primary">
            {group.name}
          </span>
        )}

        <span className="text-xs text-text-muted">{connections.length}</span>

        {/* Context menu trigger */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
            className="rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-text-primary"
          >
            <MoreHorizontal size={13} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-border bg-surface-elevated shadow-md">
              <button
                className="menu-item-button flex w-full items-center gap-2 px-3 py-1.5 text-xs"
                onClick={() => { setRenaming(true); setShowMenu(false); }}
              >
                <Pencil size={12} /> Rename
              </button>
              <button
                className="menu-item-button flex w-full items-center gap-2 px-3 py-1.5 text-xs"
                onClick={() => setShowColorPicker((v) => !v)}
              >
                <Palette size={12} /> Change Color
              </button>
              {showColorPicker && (
                <div className="flex flex-wrap gap-1.5 px-3 py-2">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => void handleColorChange(c)}
                      className="h-4 w-4 rounded-full border-2 border-transparent hover:border-border"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
              <div className="my-0.5 border-t border-border" />
              <button
                className="menu-item-button-danger flex w-full items-center gap-2 px-3 py-1.5 text-xs"
                onClick={() => { onDelete(); setShowMenu(false); }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connection list */}
      {!collapsed && (
        <div className="flex flex-col gap-1 p-1.5">
          {connections.length === 0 ? (
            <p className="px-2 py-1 text-xs text-text-muted">No connections in this group</p>
          ) : (
            connections.map((conn) => (
              <ConnectionCard
                key={conn.id}
                conn={conn}
                connectingId={connectingId}
                status={getStatus(conn.id)}
                onConnect={() => onConnect(conn)}
                onEdit={() => onEdit(conn)}
                onDelete={() => void onDeleteConnection(conn)}
                onDuplicate={onDuplicateConnection ? () => void onDuplicateConnection(conn) : undefined}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
