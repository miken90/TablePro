import { useEffect, useState } from "react";
import { Plus, Database } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionForm } from "./ConnectionForm";
import { ConnectionGroupSection } from "./ConnectionGroupSection";
import type { SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";

export function WelcomeView() {
  const { connections, groups, loadConnections, loadGroups, connect, getStatus, deleteGroup } =
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
}

export function ConnectionCard({ conn, connectingId, status, onConnect, onEdit }: CardProps) {
  return (
    <div
      className="flex items-center gap-2 rounded border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800"
      onDoubleClick={onEdit}
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
    </div>
  );
}
