export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  dbType: string;
  sslMode: string;
}

export interface SavedConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
