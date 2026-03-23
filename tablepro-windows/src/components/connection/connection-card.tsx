import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, Copy, Plug, Loader2 } from "lucide-react";
import { EngineIcon } from "./engine-icon";
import { EnvironmentBadge } from "./environment-badge";
import { ConnectionStatusIndicator } from "./connection-status-indicator";
import type { SavedConnection, ConnectionStatus } from "../../types/connection";

interface ConnectionCardProps {
  conn: SavedConnection;
  connectingId: string | null;
  status: ConnectionStatus;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onTestConnection?: () => void;
}

export function ConnectionCard({
  conn, connectingId, status, onConnect, onEdit, onDelete, onDuplicate, onTestConnection,
}: ConnectionCardProps) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isConnecting = connectingId === conn.id;

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

  // Clamp context menu to viewport bounds
  useEffect(() => {
    if (!menuPos || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.min(menuPos.x, window.innerWidth - rect.width - 4);
    const y = Math.min(menuPos.y, window.innerHeight - rect.height - 4);
    if (x !== menuPos.x || y !== menuPos.y) setMenuPos({ x, y });
  }, [menuPos]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const formattedUri = formatConnectionUri(conn);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${conn.name} connection`}
      className={`group flex items-center gap-2.5 rounded-md border p-2.5 transition-colors ${
        isConnecting
          ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/20"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
      }`}
      onDoubleClick={onConnect}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => { if (e.key === "Enter") onConnect(); }}
    >
      <EngineIcon dbType={conn.config.dbType} size={18} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {conn.name}
          </p>
          <ConnectionStatusIndicator status={status} />
          <EnvironmentBadge tag={conn.tag} />
        </div>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {formattedUri}
        </p>
      </div>

      <button
        data-connect-btn
        onClick={onConnect}
        disabled={isConnecting}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {isConnecting ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            Connecting…
          </>
        ) : (
          "Connect"
        )}
      </button>

      {menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <ContextMenuItem icon={<Plug size={12} />} label="Connect" onClick={() => { setMenuPos(null); onConnect(); }} />
          <ContextMenuItem icon={<Pencil size={12} />} label="Edit Connection" onClick={() => { setMenuPos(null); onEdit(); }} />
          {onDuplicate && (
            <ContextMenuItem icon={<Copy size={12} />} label="Duplicate" onClick={() => { setMenuPos(null); onDuplicate(); }} />
          )}
          {onTestConnection && (
            <ContextMenuItem icon={<Plug size={12} />} label="Test Connection" onClick={() => { setMenuPos(null); onTestConnection(); }} />
          )}
          <div className="my-0.5 border-t border-zinc-200 dark:border-zinc-700" />
          <ContextMenuItem
            icon={<Trash2 size={12} />}
            label="Delete"
            danger
            onClick={() => { setMenuPos(null); onDelete(); }}
          />
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({
  icon, label, danger, onClick,
}: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs ${
        danger
          ? "text-red-600 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-800"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
      onClick={onClick}
    >
      {icon} {label}
    </button>
  );
}

export function formatConnectionUri(conn: SavedConnection): string {
  const { host, port, database, dbType } = conn.config;
  if (dbType === "sqlite") return database || "SQLite database";
  const hostPart = port ? `${host}:${port}` : host;
  return database ? `${hostPart} · ${database}` : hostPart;
}
