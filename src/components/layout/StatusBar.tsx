import { Database, Table2, PanelRight, Filter, Check, X as XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConnectionStore } from "../../stores/connectionStore";
import { useQueryStore } from "../../stores/queryStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useDockStore } from "../../stores/dock-store";
import { useEffectiveBinding } from "../../hooks/useCommandRegistry";

function formatDriverType(dbType: string | undefined): string {
  if (!dbType) return "";
  const map: Record<string, string> = {
    postgres: "PostgreSQL",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    mssql: "SQL Server",
    sqlite: "SQLite",
    redis: "Redis",
    oracle: "Oracle",
    clickhouse: "ClickHouse",
    duckdb: "DuckDB",
  };
  return map[dbType.toLowerCase()] ?? dbType;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function StatusBar() {
  const { t } = useTranslation();
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const getStatus = useConnectionStore((s) => s.getStatus);

  const isExecuting = useQueryStore((s) => s.isExecuting);
  const result = useQueryStore((s) => s.result);
  const error = useQueryStore((s) => s.error);
  const durationMs = useQueryStore((s) => s.durationMs);

  const selectedDatabase = useSchemaStore((s) => s.selectedDatabase);
  const tableCount = useSchemaStore((s) => s.tables.length);

  const inspectorPaneOpen = useDockStore((s) => s.dockOpen && s.dockPane === "inspector");
  const filterVisible = useLayoutStore((s) => s.filterVisible);
  const inspectorShortcut = (useEffectiveBinding("nav.toggleInspector") ?? []).join("+");
  const filterShortcut = (useEffectiveBinding("nav.toggleFilter") ?? []).join("+");

  const activeConnection = selectedConnectionId
    ? connections.get(selectedConnectionId)
    : undefined;
  const connStatus = selectedConnectionId
    ? getStatus(selectedConnectionId)
    : "disconnected";
  const dbType = activeConnection?.config?.dbType;
  const isConnected = connStatus === "connected";

  const statusColor =
    connStatus === "connected"
      ? "bg-accent-green"
      : connStatus === "error"
        ? "bg-accent-red"
        : connStatus === "connecting"
          ? "bg-accent-yellow"
          : "bg-text-muted";

  return (
    <div className="flex h-6 items-center border-t border-border-subtle bg-surface px-3 text-[10px] text-text-secondary">
      {/* Left: connection + driver + db info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor}`} />
          <span className="max-w-[140px] truncate">
            {isConnected ? t("common.connected") : connStatus === "connecting" ? t("common.connecting") : activeConnection ? t("common.disconnected") : t("common.noConnection")}
          </span>
        </div>
        {dbType && isConnected && (
          <span className="text-text-secondary">{formatDriverType(dbType)}</span>
        )}
        {selectedDatabase && isConnected && (
          <div className="flex items-center gap-1">
            <Database size={10} />
            <span className="max-w-[120px] truncate">{selectedDatabase}</span>
          </div>
        )}
        {tableCount > 0 && isConnected && (
          <div className="flex items-center gap-1">
            <Table2 size={10} />
            <span>{tableCount} {t(tableCount !== 1 ? "common.tables" : "common.table")}</span>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center-right: result summary */}
      <div className="flex items-center gap-3">
        {isExecuting ? (
          <span className="text-accent-blue">{t("common.running")}</span>
        ) : error ? (
          <span className="flex items-center gap-1 max-w-[300px] truncate text-accent-red">
            <XIcon size={10} className="flex-shrink-0" />
            {t("common.error")}{durationMs !== null ? ` (${durationMs}ms)` : ""}
          </span>
        ) : result ? (
          <>
            <span className="flex items-center gap-1 text-accent-green">
              <Check size={10} className="flex-shrink-0" />
              {result.affectedRows > 0
                ? `${formatNumber(result.affectedRows)} ${t("common.affected")}`
                : `${formatNumber(result.rows.length)} ${t(result.rows.length !== 1 ? "common.rows" : "common.row")}`}
            </span>
            {durationMs !== null && <span>{durationMs}ms</span>}
          </>
        ) : null}
      </div>

      {/* Right: toggle buttons */}
      {isConnected && (
        <div className="ml-3 flex items-center gap-1">
          <button
            aria-pressed={inspectorPaneOpen}
            onClick={() => useDockStore.getState().toggleDockPane("inspector")}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${inspectorPaneOpen ? "bg-surface-muted text-text-primary" : "hover:bg-surface-muted"}`}
            title={t("statusBar.toggleInspector", { shortcut: inspectorShortcut })}
          >
            <PanelRight size={10} />
            <span>{t("statusBar.inspector")}</span>
          </button>
          <button
            aria-pressed={filterVisible}
            onClick={() => useLayoutStore.getState().toggleFilter()}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${filterVisible ? "bg-surface-muted text-text-primary" : "hover:bg-surface-muted"}`}
            title={t("statusBar.toggleFilter", { shortcut: filterShortcut })}
          >
            <Filter size={10} />
            <span>{t("common.filter")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
