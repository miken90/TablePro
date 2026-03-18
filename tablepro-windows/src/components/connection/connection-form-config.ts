import type { ConnectionConfig } from "../../types/connection";

export const DB_TYPES = ["postgres", "mysql", "mssql", "sqlite"];
export const SSL_MODES = ["disable", "prefer", "require", "verify-ca", "verify-full"];

export const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
};

export const DB_PLACEHOLDERS: Record<string, { user: string; database: string }> = {
  postgres: { user: "postgres", database: "postgres" },
  mysql: { user: "root", database: "" },
  mssql: { user: "sa", database: "master" },
  sqlite: { user: "", database: "/path/to/database.db" },
};

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
  "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
export const primaryBtn =
  "rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40";
export const secondaryBtn =
  "rounded border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40";
