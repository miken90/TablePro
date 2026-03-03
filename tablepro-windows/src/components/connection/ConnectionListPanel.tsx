import { useEffect, useState } from "react";
import type { DatabaseConnection } from "../../types";
import { CONNECTION_COLORS, DB_TYPE_ICONS } from "../../types";
import { useAppStore } from "../../stores/app";

interface ConnectionListPanelProps {
  onSelect: (conn: DatabaseConnection) => void;
  onEdit: (conn: DatabaseConnection) => void;
  onConnect: (conn: DatabaseConnection) => void;
}

export function ConnectionListPanel({ onSelect, onEdit, onConnect }: ConnectionListPanelProps) {
  const connections = useAppStore((s) => s.connections);
  const groups = useAppStore((s) => s.groups);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const loadConnections = useAppStore((s) => s.loadConnections);
  const loadGroups = useAppStore((s) => s.loadGroups);
  const removeConnection = useAppStore((s) => s.removeConnection);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conn: DatabaseConnection } | null>(null);

  useEffect(() => {
    loadConnections();
    loadGroups();
  }, [loadConnections, loadGroups]);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const filtered = connections.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const grouped = groups.map((g) => ({
    group: g,
    connections: filtered.filter((c) => c.groupId === g.id),
  }));
  const ungrouped = filtered.filter((c) => !c.groupId);

  const colorHex = (color: string) =>
    CONNECTION_COLORS.find((c) => c.value === color)?.hex ?? "transparent";

  const renderConnection = (conn: DatabaseConnection) => (
    <div
      key={conn.id}
      className="group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
      onDoubleClick={() => onConnect(conn)}
      onClick={() => onSelect(conn)}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, conn });
      }}
    >
      {conn.color !== "none" && (
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: colorHex(conn.color) }}
        />
      )}
      <span className="shrink-0">{DB_TYPE_ICONS[conn.dbType]}</span>
      <span className="truncate flex-1">{conn.name}</span>
      <span className="text-xs text-zinc-500 opacity-0 group-hover:opacity-100">
        {conn.host}:{conn.port}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      {grouped.map(
        ({ group, connections: groupConns }) =>
          groupConns.length > 0 && (
            <div key={group.id}>
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                {group.color !== "none" && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: colorHex(group.color) }}
                  />
                )}
                {group.name}
              </div>
              {groupConns.map(renderConnection)}
            </div>
          ),
      )}
      {ungrouped.length > 0 && (
        <div>
          {groups.length > 0 && (
            <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Ungrouped
            </div>
          )}
          {ungrouped.map(renderConnection)}
        </div>
      )}
      {filtered.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-zinc-500">No connections</p>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onConnect(contextMenu.conn);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Connect
          </button>
          <button
            onClick={() => {
              onEdit(contextMenu.conn);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Edit
          </button>
          <hr className="my-1 border-zinc-700" />
          <button
            onClick={() => {
              removeConnection(contextMenu.conn.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
