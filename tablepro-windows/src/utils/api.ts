import { invoke } from "@tauri-apps/api/core";
import type { DatabaseConnection, ConnectionGroup, QueryResult, TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo } from "../types";

interface StoredConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  db_type: string;
  ssl_mode: string;
  ssl_ca_cert_path: string;
  ssl_client_cert_path: string;
  ssl_client_key_path: string;
  ssh_enabled: boolean;
  ssh_host: string;
  ssh_port: number;
  ssh_username: string;
  ssh_auth_method: string;
  ssh_private_key_path: string;
  color: string;
  tag_id: string | null;
  group_id: string | null;
  is_read_only: boolean;
}

function toStoredConnection(conn: DatabaseConnection): StoredConnection {
  return {
    id: conn.id,
    name: conn.name,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    db_type: conn.dbType,
    ssl_mode: conn.sslConfig.mode,
    ssl_ca_cert_path: conn.sslConfig.caCertPath,
    ssl_client_cert_path: conn.sslConfig.clientCertPath,
    ssl_client_key_path: conn.sslConfig.clientKeyPath,
    ssh_enabled: conn.sshConfig.enabled,
    ssh_host: conn.sshConfig.host,
    ssh_port: conn.sshConfig.port,
    ssh_username: conn.sshConfig.username,
    ssh_auth_method: conn.sshConfig.authMethod,
    ssh_private_key_path: conn.sshConfig.privateKeyPath,
    color: conn.color,
    tag_id: conn.tagId,
    group_id: conn.groupId,
    is_read_only: conn.isReadOnly,
  };
}

function fromStoredConnection(stored: StoredConnection): DatabaseConnection {
  return {
    id: stored.id,
    name: stored.name,
    host: stored.host,
    port: stored.port,
    database: stored.database,
    username: stored.username,
    dbType: stored.db_type as DatabaseConnection["dbType"],
    sslConfig: {
      mode: stored.ssl_mode as DatabaseConnection["sslConfig"]["mode"],
      caCertPath: stored.ssl_ca_cert_path,
      clientCertPath: stored.ssl_client_cert_path,
      clientKeyPath: stored.ssl_client_key_path,
    },
    sshConfig: {
      enabled: stored.ssh_enabled,
      host: stored.ssh_host,
      port: stored.ssh_port,
      username: stored.ssh_username,
      authMethod: stored.ssh_auth_method as DatabaseConnection["sshConfig"]["authMethod"],
      privateKeyPath: stored.ssh_private_key_path,
    },
    color: stored.color as DatabaseConnection["color"],
    tagId: stored.tag_id,
    groupId: stored.group_id,
    isReadOnly: stored.is_read_only,
  };
}

export async function getConnections(): Promise<DatabaseConnection[]> {
  const stored = await invoke<StoredConnection[]>("get_connections");
  return stored.map(fromStoredConnection);
}

export async function saveConnection(conn: DatabaseConnection, password?: string): Promise<void> {
  await invoke("save_connection", {
    connection: toStoredConnection(conn),
    password: password ?? null,
  });
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await invoke("delete_connection", { connection_id: connectionId });
}

export async function getPassword(connectionId: string): Promise<string | null> {
  return invoke<string | null>("get_password", { connection_id: connectionId });
}

export async function testConnection(conn: DatabaseConnection, password?: string, sshPassword?: string): Promise<boolean> {
  return invoke<boolean>("test_connection", {
    config: {
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      db_type: conn.dbType,
      ssl_config: {
        enabled: conn.sslConfig.mode !== "disabled",
        ca_cert_path: conn.sslConfig.caCertPath || null,
        client_cert_path: conn.sslConfig.clientCertPath || null,
        client_key_path: conn.sslConfig.clientKeyPath || null,
        verify_server_cert: conn.sslConfig.mode === "verify_ca" || conn.sslConfig.mode === "verify_identity",
      },
      ssh_config: {
        enabled: conn.sshConfig.enabled,
        host: conn.sshConfig.host,
        port: conn.sshConfig.port,
        username: conn.sshConfig.username,
        auth_method: conn.sshConfig.authMethod,
        private_key_path: conn.sshConfig.privateKeyPath || null,
      },
      is_read_only: conn.isReadOnly,
      color: conn.color === "none" ? null : conn.color,
    },
    password: password ?? null,
    ssh_password: sshPassword ?? null,
  });
}

export async function connectToDatabase(conn: DatabaseConnection, password?: string, sshPassword?: string): Promise<string> {
  return invoke<string>("connect", {
    config: {
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      db_type: conn.dbType,
      ssl_config: {
        enabled: conn.sslConfig.mode !== "disabled",
        ca_cert_path: conn.sslConfig.caCertPath || null,
        client_cert_path: conn.sslConfig.clientCertPath || null,
        client_key_path: conn.sslConfig.clientKeyPath || null,
        verify_server_cert: conn.sslConfig.mode === "verify_ca" || conn.sslConfig.mode === "verify_identity",
      },
      ssh_config: {
        enabled: conn.sshConfig.enabled,
        host: conn.sshConfig.host,
        port: conn.sshConfig.port,
        username: conn.sshConfig.username,
        auth_method: conn.sshConfig.authMethod,
        private_key_path: conn.sshConfig.privateKeyPath || null,
      },
      is_read_only: conn.isReadOnly,
      color: conn.color === "none" ? null : conn.color,
    },
    password: password ?? null,
    ssh_password: sshPassword ?? null,
  });
}

export async function disconnectFromDatabase(connectionId: string): Promise<void> {
  await invoke("disconnect", { connection_id: connectionId });
}

export async function executeQuery(connectionId: string, query: string): Promise<QueryResult> {
  return invoke<QueryResult>("execute_query", { connection_id: connectionId, query });
}

export async function fetchTables(connectionId: string): Promise<TableInfo[]> {
  return invoke<TableInfo[]>("fetch_tables", { connection_id: connectionId });
}

export async function fetchColumns(connectionId: string, table: string): Promise<ColumnInfo[]> {
  return invoke<ColumnInfo[]>("fetch_columns", { connection_id: connectionId, table });
}

export async function fetchIndexes(connectionId: string, table: string): Promise<IndexInfo[]> {
  return invoke<IndexInfo[]>("fetch_indexes", { connection_id: connectionId, table });
}

export async function fetchForeignKeys(connectionId: string, table: string): Promise<ForeignKeyInfo[]> {
  return invoke<ForeignKeyInfo[]>("fetch_foreign_keys", { connection_id: connectionId, table });
}

export async function fetchTableDdl(connectionId: string, table: string): Promise<string> {
  return invoke<string>("fetch_table_ddl", { connection_id: connectionId, table });
}

export async function fetchDatabases(connectionId: string): Promise<string[]> {
  return invoke<string[]>("fetch_databases", { connection_id: connectionId });
}

export async function fetchSchemas(connectionId: string): Promise<string[]> {
  return invoke<string[]>("fetch_schemas", { connection_id: connectionId });
}

export async function fetchRows(connectionId: string, query: string, offset: number, limit: number): Promise<QueryResult> {
  return invoke<QueryResult>("fetch_rows", { connection_id: connectionId, query, offset, limit });
}

export async function fetchRowCount(connectionId: string, query: string): Promise<number> {
  return invoke<number>("fetch_row_count", { connection_id: connectionId, query });
}

export async function getGroups(): Promise<ConnectionGroup[]> {
  const stored = await invoke<Array<{ id: string; name: string; color: string }>>("get_groups");
  return stored.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color as ConnectionGroup["color"],
  }));
}

export async function saveGroup(group: ConnectionGroup): Promise<void> {
  await invoke("save_group", {
    group: { id: group.id, name: group.name, color: group.color },
  });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await invoke("delete_group", { group_id: groupId });
}
