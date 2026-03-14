import { invoke } from "@tauri-apps/api/core";
import type { ConnectionConfig, SavedConnection, ConnectionStatus } from "../types/connection";
import type { QueryResult } from "../types/query";
import type { TableInfo, IndexInfo, ForeignKeyInfo } from "../types/schema";
import type { ColumnInfo } from "../types/query";
import type { AppSettings } from "../types/settings";

// Connection commands
export const testConnection = (config: ConnectionConfig): Promise<void> =>
  invoke("test_connection", { config });

export const connect = (config: ConnectionConfig): Promise<string> =>
  invoke("connect", { config });

export const disconnect = (sessionId: string): Promise<void> =>
  invoke("disconnect", { sessionId });

export const getConnectionStatus = (sessionId: string): Promise<ConnectionStatus> =>
  invoke("get_connection_status", { sessionId });

// Query commands
export const executeQuery = (sessionId: string, sql: string, params?: string[]): Promise<QueryResult> =>
  invoke("execute_query", { sessionId, sql, params });

export const fetchRows = (sessionId: string, table: string, offset: number, limit: number): Promise<QueryResult> =>
  invoke("fetch_rows", { sessionId, table, offset, limit });

export const fetchCount = (sessionId: string, table: string): Promise<number> =>
  invoke("fetch_count", { sessionId, table });

export const cancelQuery = (sessionId: string): Promise<void> =>
  invoke("cancel_query", { sessionId });

// Schema commands
export const fetchTables = (sessionId: string): Promise<TableInfo[]> =>
  invoke("fetch_tables", { sessionId });

export const fetchColumns = (sessionId: string, table: string, schema?: string): Promise<ColumnInfo[]> =>
  invoke("fetch_columns", { sessionId, table, schema });

export const fetchIndexes = (sessionId: string, table: string, schema?: string): Promise<IndexInfo[]> =>
  invoke("fetch_indexes", { sessionId, table, schema });

export const fetchForeignKeys = (sessionId: string, table: string, schema?: string): Promise<ForeignKeyInfo[]> =>
  invoke("fetch_foreign_keys", { sessionId, table, schema });

export const fetchDatabases = (sessionId: string): Promise<string[]> =>
  invoke("fetch_databases", { sessionId });

export const switchDatabase = (sessionId: string, database: string): Promise<void> =>
  invoke("switch_database", { sessionId, database });

export const fetchDdl = (sessionId: string, table: string, schema?: string): Promise<string> =>
  invoke("fetch_ddl", { sessionId, table, schema });

// Settings commands
export const getSettings = (): Promise<AppSettings> =>
  invoke("get_settings");

export const setSettings = (settings: AppSettings): Promise<void> =>
  invoke("set_settings", { settings });

// Connection storage commands
export const listConnections = (): Promise<SavedConnection[]> =>
  invoke("list_connections");

export const saveConnection = (connection: SavedConnection): Promise<void> =>
  invoke("save_connection", { connection });

export const deleteConnection = (id: string): Promise<void> =>
  invoke("delete_connection", { id });

// Data mutation types
export interface CellChangePayload {
  columnName: string;
  oldValue: string | null;
  newValue: string | null;
}
export interface RowChangePayload {
  changeType: 'Insert' | 'Update' | 'Delete';
  originalRow: (string | null)[];
  cellChanges: CellChangePayload[];
}
export interface SavePayload {
  table: string;
  schema: string | null;
  columns: string[];
  primaryKeys: string[];
  changes: RowChangePayload[];
}
export interface SaveResult {
  rowsAffected: number;
  statementsExecuted: number;
}
export const saveChanges = (sessionId: string, payload: SavePayload): Promise<SaveResult> =>
  invoke('save_changes', { sessionId, payload });

// Export commands
export interface ExportOptions {
  delimiter?: string;
  includeHeader?: boolean;
  pretty?: boolean;
  arrayOfArrays?: boolean;
  tableName?: string;
  includeCreateTable?: boolean;
  batchSize?: number;
}
export interface ExportResult {
  rowsExported: number;
  filePath: string;
  durationMs: number;
}
export const exportToFile = (
  sessionId: string,
  sql: string,
  format: string,
  filePath: string,
  options: ExportOptions,
): Promise<ExportResult> =>
  invoke('export_to_file', { sessionId, sql, format, filePath, options });
