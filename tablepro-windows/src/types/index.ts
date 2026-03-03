export type DatabaseType = "mysql" | "mariadb" | "postgresql" | "sqlite" | "mongodb";

export type ConnectionColor =
  | "none"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "gray";

export type SshAuthMethod = "password" | "privatekey";

export type SslMode = "disabled" | "preferred" | "required" | "verify_ca" | "verify_identity";

export interface SslConfig {
  mode: SslMode;
  caCertPath: string;
  clientCertPath: string;
  clientKeyPath: string;
}

export interface SshConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  privateKeyPath: string;
}

export interface DatabaseConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  dbType: DatabaseType;
  sslConfig: SslConfig;
  sshConfig: SshConfig;
  color: ConnectionColor;
  tagId: string | null;
  groupId: string | null;
  isReadOnly: boolean;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  color: ConnectionColor;
}

export interface ConnectionTag {
  id: string;
  name: string;
  isPreset: boolean;
  color: ConnectionColor;
}

export interface QueryResult {
  columns: string[];
  column_types: ColumnType[];
  rows: (string | null)[][];
  rows_affected: number;
  execution_time_ms: number;
  error: string | null;
  is_truncated: boolean;
}

export type ColumnType =
  | { type: "Text"; raw_type: string | null }
  | { type: "Integer"; raw_type: string | null }
  | { type: "Decimal"; raw_type: string | null }
  | { type: "Date"; raw_type: string | null }
  | { type: "Timestamp"; raw_type: string | null }
  | { type: "DateTime"; raw_type: string | null }
  | { type: "Boolean"; raw_type: string | null }
  | { type: "Blob"; raw_type: string | null }
  | { type: "Json"; raw_type: string | null }
  | { type: "Enum"; raw_type: string | null; values: string[] | null }
  | { type: "Set"; raw_type: string | null; values: string[] | null };

export interface TableInfo {
  name: string;
  table_type: "TABLE" | "VIEW" | "SYSTEM_TABLE";
  row_count: number | null;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  default_value: string | null;
  extra: string | null;
  charset: string | null;
  collation: string | null;
  comment: string | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
  index_type: string;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referenced_table: string;
  referenced_column: string;
  on_delete: string;
  on_update: string;
}

export interface SidebarNode {
  id: string;
  name: string;
  nodeType: "database" | "table" | "view" | "system_table";
  children?: SidebarNode[];
  rowCount?: number | null;
}

export interface QueryTab {
  id: string;
  title: string;
  query: string;
  connectionId: string | null;
  database: string | null;
  isDirty: boolean;
}

export const DEFAULT_SSL_CONFIG: SslConfig = {
  mode: "disabled",
  caCertPath: "",
  clientCertPath: "",
  clientKeyPath: "",
};

export const DEFAULT_SSH_CONFIG: SshConfig = {
  enabled: false,
  host: "",
  port: 22,
  username: "",
  authMethod: "password",
  privateKeyPath: "",
};

export const DB_TYPE_DEFAULTS: Record<DatabaseType, { port: number; username: string }> = {
  mysql: { port: 3306, username: "root" },
  mariadb: { port: 3306, username: "root" },
  postgresql: { port: 5432, username: "postgres" },
  sqlite: { port: 0, username: "" },
  mongodb: { port: 27017, username: "" },
};

export const CONNECTION_COLORS: { value: ConnectionColor; label: string; hex: string }[] = [
  { value: "none", label: "None", hex: "transparent" },
  { value: "red", label: "Red", hex: "#ef4444" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "yellow", label: "Yellow", hex: "#eab308" },
  { value: "green", label: "Green", hex: "#22c55e" },
  { value: "blue", label: "Blue", hex: "#3b82f6" },
  { value: "purple", label: "Purple", hex: "#a855f7" },
  { value: "pink", label: "Pink", hex: "#ec4899" },
  { value: "gray", label: "Gray", hex: "#6b7280" },
];

export const DB_TYPE_ICONS: Record<DatabaseType, string> = {
  mysql: "🐬",
  mariadb: "🦭",
  postgresql: "🐘",
  sqlite: "📦",
  mongodb: "🍃",
};
