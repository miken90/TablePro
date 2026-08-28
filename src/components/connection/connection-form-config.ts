import type { ConnectionConfig } from "../../types/connection";
import type { DriverInfo } from "../../types/capability";

export const DB_TYPES = ["postgres", "mysql", "mssql", "sqlite", "mongodb", "redis"];
export const SSL_MODES = ["disable", "prefer", "require", "verify-ca", "verify-full"];

export const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
  mongodb: 27017,
  redis: 6379,
};

export const DB_PLACEHOLDERS: Record<string, { user: string; database: string }> = {
  postgres: { user: "postgres", database: "postgres" },
  mysql: { user: "root", database: "" },
  mssql: { user: "sa", database: "master" },
  sqlite: { user: "", database: "/path/to/database.db" },
  mongodb: { user: "", database: "admin" },
  redis: { user: "", database: "0" },
};

/** Build DB_TYPES list from loaded drivers, falling back to hardcoded list. */
export function getDbTypes(drivers: DriverInfo[] | null): string[] {
  if (drivers && drivers.length > 0) {
    return drivers.map((d) => d.typeId);
  }
  return DB_TYPES;
}

/** Get default port for a given dbType, using driver metadata if available. */
export function getDefaultPort(dbType: string, drivers: DriverInfo[] | null): number {
  if (drivers) {
    const driver = drivers.find((d) => d.typeId === dbType);
    if (driver) return driver.defaultPort;
  }
  return DEFAULT_PORTS[dbType] ?? 0;
}

export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  host: "localhost",
  port: 5432,
  user: "",
  password: "",
  database: "",
  dbType: "postgres",
  sslMode: "prefer",
  sshEnabled: false,
  sshHost: "",
  sshPort: 22,
  sshUser: "",
  sshAuthMethod: "password",
  sshPassword: "",
  sshKeyPath: "",
  sshKeyPassphrase: "",
};

export const inputCls =
  "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
export const primaryBtn =
  "rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40";
export const secondaryBtn =
  "rounded border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40";
