import { useState, useCallback } from "react";
import type { DatabaseConnection } from "../types";
import { useAppStore } from "../stores/app";
import { ConnectionListPanel } from "../components/connection/ConnectionListPanel";
import { ConnectionForm } from "../components/connection/ConnectionForm";
import { connectToDatabase, getPassword } from "../utils/api";

export function WelcomeWindow() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const addConnection = useAppStore((s) => s.addConnection);
  const updateConnection = useAppStore((s) => s.updateConnection);
  const setView = useAppStore((s) => s.setView);
  const setActiveConnectionId = useAppStore((s) => s.setActiveConnectionId);
  const setServerVersion = useAppStore((s) => s.setServerVersion);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleNewConnection = useCallback(() => {
    setEditingConnection(null);
    setShowForm(true);
    setConnectError(null);
  }, []);

  const handleEdit = useCallback((conn: DatabaseConnection) => {
    setEditingConnection(conn);
    setShowForm(true);
    setConnectError(null);
  }, []);

  const handleSave = useCallback(
    async (conn: DatabaseConnection, password: string) => {
      if (editingConnection) {
        await updateConnection(conn, password);
      } else {
        await addConnection(conn, password);
      }
      setShowForm(false);
      setEditingConnection(null);
    },
    [editingConnection, addConnection, updateConnection],
  );

  const handleConnect = useCallback(
    async (conn: DatabaseConnection) => {
      setConnecting(true);
      setConnectError(null);
      try {
        const pw = await getPassword(conn.id);
        const version = await connectToDatabase(conn, pw ?? undefined);
        setActiveConnectionId(conn.id);
        setServerVersion(version);
        setView("main");
      } catch (err) {
        setConnectError(String(err));
      } finally {
        setConnecting(false);
      }
    },
    [setActiveConnectionId, setServerVersion, setView],
  );

  return (
    <div className="flex h-screen bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {/* Left Panel */}
      <div className="flex w-[280px] flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            ⬡
          </div>
          <h1 className="mb-0.5 text-lg font-semibold">TablePro</h1>
          <span className="mb-6 text-xs text-zinc-500">v0.1.0</span>
          <button
            onClick={handleNewConnection}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            New connection
          </button>
        </div>
        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          <ConnectionListPanel
            onSelect={() => {}}
            onEdit={handleEdit}
            onConnect={handleConnect}
          />
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-1 flex-col">
        {showForm ? (
          <ConnectionForm
            initial={editingConnection ?? undefined}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingConnection(null);
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {connecting && <p className="text-sm text-zinc-500 dark:text-zinc-400">Connecting…</p>}
            {connectError && (
              <div className="max-w-md rounded-md bg-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-900/50 dark:text-red-300">
                {connectError}
              </div>
            )}
            {!connecting && !connectError && (
              <>
                <p className="text-sm text-zinc-500">
                  Select a connection or create a new one
                </p>
                <button
                  onClick={handleNewConnection}
                  className="rounded-lg border border-dashed border-zinc-300 px-6 py-3 text-sm text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:text-zinc-200"
                >
                  + New Connection
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
