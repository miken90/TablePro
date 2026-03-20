import { useEffect, useState, useRef } from "react";
import { Plus, Database, Pencil, Trash2 } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionForm } from "./ConnectionForm";
import { ConnectionGroupSection } from "./ConnectionGroupSection";
import type { SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";

export function WelcomeView() {
  const { connections, groups, loadConnections, loadGroups, connect, getStatus, deleteGroup, deleteConnection } =
    useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<SavedConnection | undefined>();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadConnections();
    void loadGroups();
  }, [loadConnections, loadGroups]);

  const handleConnect = async (conn: SavedConnection) => {
    setConnectingId(conn.id);
    setError(null);
    try {
      await connect(conn.id, conn.config);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setConnectingId(null);
    }
  };

  const handleEdit = (conn: SavedConnection) => {
    setEditingConn(conn);
    setShowForm(true);
  };

  const handleDelete = async (conn: SavedConnection) => {
    await deleteConnection(conn.id);
  };

  const handleNewGroup = async () => {
    const { saveGroup } = useConnectionStore.getState();
    const id = crypto.randomUUID();
    await saveGroup({ id, name: "New Group", color: "#6366f1", order: groups.size, collapsed: false });
  };

  if (showForm) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto pt-12">
        <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <ConnectionForm
            initial={editingConn}
            onClose={() => { setShowForm(false); setEditingConn(undefined); }}
          />
        </div>
      </div>
    );
  }

  const connList = Array.from(connections.values());
  const groupList = Array.from(groups.values()).sort((a, b) => a.order - b.order);
  const ungrouped = connList.filter((c) => !c.groupId);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <Database size={40} className="text-blue-500" />
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">TablePro</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Connect to a database to get started</p>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {(connList.length > 0 || groupList.length > 0) && (
        <div className="w-full max-w-sm space-y-2">
          {groupList.map((group) => {
            const groupConns = connList.filter((c) => c.groupId === group.id);
            return (
              <ConnectionGroupSection
                key={group.id}
                group={group}
                connections={groupConns}
                connectingId={connectingId}
                getStatus={getStatus}
                onConnect={handleConnect}
                onEdit={handleEdit}
                onDelete={() => void deleteGroup(group.id)}
                onDeleteConnection={handleDelete}
              />
            );
          })}

          {ungrouped.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Ungrouped</p>
              <div className="flex flex-col gap-1">
                {ungrouped.map((conn) => (
                  <ConnectionCard
                    key={conn.id}
                    conn={conn}
                    connectingId={connectingId}
                    status={getStatus(conn.id)}
                    onConnect={() => void handleConnect(conn)}
                    onEdit={() => handleEdit(conn)}
                    onDelete={() => void handleDelete(conn)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { setEditingConn(undefined); setShowForm(true); }}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus size={14} />
          New Connection
        </button>
        <button
          onClick={() => void handleNewGroup()}
          className="flex items-center gap-1.5 rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Plus size={14} />
          New Group
        </button>
      </div>
    </div>
  );
}

interface CardProps {
  conn: SavedConnection;
  connectingId: string | null;
  status: string;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ConnectionCard({ conn, connectingId, status, onConnect, onEdit, onDelete }: CardProps) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuPos]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="flex items-center gap-2 rounded border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800"
      onDoubleClick={onEdit}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`h-2 w-2 shrink-0 rounded-full ${
          status === "connected" ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{conn.name}</p>
        <p className="truncate text-xs text-zinc-500">{conn.config.host}:{conn.config.port}/{conn.config.database}</p>
      </div>
      <button
        onClick={onConnect}
        disabled={connectingId === conn.id}
        className="flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {connectingId === conn.id ? "Connecting…" : "Connect"}
      </button>

      {menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => { setMenuPos(null); onEdit(); }}
          >
            <Pencil size={12} /> Edit
          </button>
          <div className="my-0.5 border-t border-zinc-200 dark:border-zinc-700" />
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
            onClick={() => { setMenuPos(null); onDelete(); }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
