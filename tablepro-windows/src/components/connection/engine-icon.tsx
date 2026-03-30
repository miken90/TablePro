import { Database } from "lucide-react";

const ENGINE_COLORS: Record<string, string> = {
  postgres: "text-blue-500",
  postgresql: "text-blue-500",
  mysql: "text-orange-500",
  mariadb: "text-orange-500",
  mssql: "text-red-500",
  sqlserver: "text-red-500",
  sqlite: "text-emerald-500",
  redis: "text-rose-500",
  oracle: "text-red-600",
  clickhouse: "text-yellow-500",
  duckdb: "text-amber-600",
};

const ENGINE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
  mssql: "SQL Server",
  sqlserver: "SQL Server",
  sqlite: "SQLite",
  redis: "Redis",
  oracle: "Oracle",
  clickhouse: "ClickHouse",
  duckdb: "DuckDB",
};

interface EngineIconProps {
  dbType: string;
  size?: number;
}

export function engineLabel(dbType: string): string {
  return ENGINE_LABELS[dbType.toLowerCase()] ?? dbType;
}

export function EngineIcon({ dbType, size = 16 }: EngineIconProps) {
  const key = dbType.toLowerCase();
  const color = ENGINE_COLORS[key] ?? "text-zinc-400";
  const label = ENGINE_LABELS[key] ?? dbType;

  return (
    <span className={`shrink-0 ${color}`} title={label} aria-label={label}>
      <Database size={size} />
    </span>
  );
}
