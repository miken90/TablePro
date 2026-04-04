export interface ConnectionGroup {
  id: string;
  name: string;
  /** Hex color string, e.g. "#ef4444" */
  color: string;
  order: number;
  collapsed: boolean;
}

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dbType: string;
  sslMode: string;
  startupCommands?: string;
  /** MongoDB: use mongodb+srv:// protocol (DNS SRV lookup) */
  useSrv?: boolean;
  /** Redis: enable TLS encryption */
  tlsEnabled?: boolean;
  /** Redis: path to CA certificate file for TLS verification */
  tlsCaCertPath?: string;
  // SSH tunnel fields
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  /** "password" | "key" */
  sshAuthMethod: string;
  sshPassword: string;
  sshKeyPath: string;
  sshKeyPassphrase: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
  groupId?: string;
  color?: string;
  tag?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
