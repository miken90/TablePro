import { useEffect, useState } from "react";
import { Plus, Database, Plug } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionForm } from "./ConnectionForm";
import type { SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";

export function WelcomeView() {
  const { connections, loadConnections, connect, getStatus } = useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<SavedConnection | undefined>();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

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

      {connList.length > 0 && (
        <div className="w-full max-w-sm">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Saved Connections</p>
          <div className="flex flex-col gap-1">
            {connList.map((conn) => {
              const status = getStatus(conn.id);
              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-2 rounded border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      status === "connected" ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{conn.name}</p>
                    <p className="truncate text-xs text-zinc-500">{conn.config.host}:{conn.config.port}/{conn.config.database}</p>
                  </div>
                  <button
                    onClick={() => void handleConnect(conn)}
                    disabled={connectingId === conn.id}
                    className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Plug size={11} />
                    {connectingId === conn.id ? "Connecting…" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => { setEditingConn(undefined); setShowForm(true); }}
        className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        <Plus size={14} />
        New Connection
      </button>
    </div>
  );
}
