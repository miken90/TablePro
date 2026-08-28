import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, Copy, Plug, Loader2, Upload, Link } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EngineIcon } from "./engine-icon";
import { EnvironmentBadge } from "./environment-badge";
import { ConnectionStatusIndicator } from "./connection-status-indicator";
import { Menu, MenuItem, MenuDivider } from "../ui";
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
  onExport?: () => void;
  onCopyImportLink?: () => void;
}

export function ConnectionCard({
  conn, connectingId, status, onConnect, onEdit, onDelete, onDuplicate, onTestConnection, onExport, onCopyImportLink,
}: ConnectionCardProps) {
  const { t } = useTranslation();
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
      aria-label={t("connection.card.connectionLabel", { name: conn.name })}
      className={`group flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface-elevated p-xl shadow-sm transition-colors hover:border-border hover:shadow-base ${
        isConnecting ? "ring-2 ring-accent-blue" : ""
      }`}
      onDoubleClick={onConnect}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => { if (e.key === "Enter") onConnect(); }}
    >
      <EngineIcon dbType={conn.config.dbType} size={16} />

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
          t("common.connect")
        )}
      </button>

      {menuPos && (
        <div ref={menuRef} className="fixed z-popover" style={{ left: menuPos.x, top: menuPos.y }}>
          <Menu open onClose={() => setMenuPos(null)}>
            <MenuItem icon={<Plug size={12} />} onSelect={() => { setMenuPos(null); onConnect(); }}>
              {t("common.connect")}
            </MenuItem>
            <MenuItem icon={<Pencil size={12} />} onSelect={() => { setMenuPos(null); onEdit(); }}>
              {t("connection.card.editConnection")}
            </MenuItem>
            {onDuplicate && (
              <MenuItem icon={<Copy size={12} />} onSelect={() => { setMenuPos(null); onDuplicate(); }}>
                {t("connection.card.duplicate")}
              </MenuItem>
            )}
            {onTestConnection && (
              <MenuItem icon={<Plug size={12} />} onSelect={() => { setMenuPos(null); onTestConnection(); }}>
                {t("connection.card.testConnection")}
              </MenuItem>
            )}
            <MenuDivider />
            {onExport && (
              <MenuItem icon={<Upload size={12} />} onSelect={() => { setMenuPos(null); onExport(); }}>
                {t("connection.export.exportConnection")}
              </MenuItem>
            )}
            {onCopyImportLink && (
              <MenuItem icon={<Link size={12} />} onSelect={() => { setMenuPos(null); onCopyImportLink(); }}>
                {t("connection.export.copyLink")}
              </MenuItem>
            )}
            <MenuDivider />
            {/* Text-only red: this only opens the caller's own confirm dialog,
                nothing is written yet — danger-ghost by construction, never
                the filled danger variant (design-spec 5.16, AUDIT M5). */}
            <MenuItem icon={<Trash2 size={12} />} danger onSelect={() => { setMenuPos(null); onDelete(); }}>
              {t("common.delete")}
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
}

export function formatConnectionUri(conn: SavedConnection): string {
  const { host, port, database, dbType } = conn.config;
  if (dbType === "sqlite") return database || "SQLite database";
  const hostPart = port ? `${host}:${port}` : host;
  return database ? `${hostPart} · ${database}` : hostPart;
}
