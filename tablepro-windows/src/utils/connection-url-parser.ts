import type { ConnectionConfig } from "../types/connection";

const PROTOCOL_TO_DB_TYPE: Record<string, string> = {
  mysql: "mysql",
  postgresql: "postgres",
  postgres: "postgres",
  mssql: "mssql",
  sqlserver: "mssql",
  mongodb: "mongodb",
  "mongodb+srv": "mongodb",
  redis: "redis",
  rediss: "redis",
};

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433,
  mongodb: 27017,
  redis: 6379,
};

export function parseConnectionUrl(url: string): Partial<ConnectionConfig> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Connection URL is empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid connection URL format");
  }

  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  const dbType = PROTOCOL_TO_DB_TYPE[protocol];
  if (!dbType) {
    throw new Error(`Unsupported protocol: ${protocol}`);
  }

  const database = parsed.pathname.replace(/^\//, "");
  const isSrv = protocol === "mongodb+srv";
  const port = parsed.port ? Number(parsed.port) : (isSrv ? 27017 : DEFAULT_PORTS[dbType]);

  const result: Partial<ConnectionConfig> = {
    dbType,
    host: parsed.hostname || "localhost",
    port,
    user: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    database: decodeURIComponent(database),
  };

  if (dbType === "mongodb") {
    result.useSrv = isSrv;
  }

  if (dbType === "redis") {
    result.tlsEnabled = protocol === "rediss";
  }

  return result;
}
