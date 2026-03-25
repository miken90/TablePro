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
          ? "border-accent-blue bg-accent-blue/10"
          : "border-border bg-surface-elevated hover:bg-surface-muted"
      }`}
      onDoubleClick={onConnect}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => { if (e.key === "Enter") onConnect(); }}
    >
      <EngineIcon dbType={conn.config.dbType} size={18} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">
            {conn.name}
          </p>
          <ConnectionStatusIndicator status={status} />
          <EnvironmentBadge tag={conn.tag} />
        </div>
        <p className="truncate text-xs text-text-secondary">
          {formattedUri}
        </p>
      </div>

      <button
        data-connect-btn
        onClick={onConnect}
        disabled={isConnecting}
        className="button-primary flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
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
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-surface-elevated py-1 shadow-lg"
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
          <div className="my-0.5 border-t border-border" />
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
        danger ? "menu-item-button-danger" : "menu-item-button"
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
