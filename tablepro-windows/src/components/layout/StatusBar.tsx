import { useConnectionStore } from "../../stores/connectionStore";
import { useQueryStore } from "../../stores/queryStore";

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
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const getStatus = useConnectionStore((s) => s.getStatus);

  const isExecuting = useQueryStore((s) => s.isExecuting);
  const result = useQueryStore((s) => s.result);
  const error = useQueryStore((s) => s.error);
  const durationMs = useQueryStore((s) => s.durationMs);

  const activeConnection = selectedConnectionId
    ? connections.get(selectedConnectionId)
    : undefined;
  const connStatus = selectedConnectionId
    ? getStatus(selectedConnectionId)
    : "disconnected";
  const dbType = activeConnection?.config?.dbType;

  const statusColor =
    connStatus === "connected"
      ? "bg-accent-green"
      : connStatus === "error"
        ? "bg-accent-red"
        : connStatus === "connecting"
          ? "bg-accent-yellow"
          : "bg-text-muted";

  return (
    <div className="flex h-6 items-center border-t border-border-subtle bg-surface px-3 text-[11px] text-text-muted">
      {/* Left: connection */}
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
        <span className="max-w-[180px] truncate">
          {activeConnection ? activeConnection.name : "No connection"}
        </span>
      </div>

      {/* Center: row count + timing */}
      <div className="flex flex-1 items-center justify-center gap-3">
        {isExecuting ? (
          <span className="text-accent-blue">Running…</span>
        ) : error ? (
          <span className="max-w-[300px] truncate text-accent-red">
            Error{durationMs !== null ? ` (${durationMs}ms)` : ""}
          </span>
        ) : result ? (
          <>
            <span>
              {result.affectedRows > 0
                ? `${formatNumber(result.affectedRows)} affected`
                : `${formatNumber(result.rows.length)} row${result.rows.length !== 1 ? "s" : ""}`}
            </span>
            {durationMs !== null && <span>{durationMs}ms</span>}
          </>
        ) : null}
      </div>

      {/* Right: driver type */}
      <div className="flex items-center gap-2">
        {dbType && (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px]">
            {formatDriverType(dbType)}
          </span>
        )}
      </div>
    </div>
  );
}
