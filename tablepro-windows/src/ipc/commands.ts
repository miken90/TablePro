import { invoke } from "@tauri-apps/api/core";
import type { ConnectionConfig, ConnectionGroup, SavedConnection, ConnectionStatus } from "../types/connection";
import type { DriverCapabilities, DriverInfo } from "../types/capability";
import type { QueryResult } from "../types/query";
import type { TableInfo, IndexInfo, ForeignKeyInfo, RoutineCatalog } from "../types/schema";
import type { ColumnInfo } from "../types/query";
import type { AppSettings } from "../types/settings";

// Connection commands
export const testConnection = (config: ConnectionConfig): Promise<void> =>
  invoke("test_connection", { config });

export const connect = (config: ConnectionConfig): Promise<string> =>
  invoke("connect", { config });

export const disconnect = (sessionId: string): Promise<void> =>
  invoke("disconnect", { sessionId });

export const reconnectSession = (sessionId: string): Promise<void> =>
  invoke("reconnect_session", { sessionId });

export const getConnectionStatus = (sessionId: string): Promise<ConnectionStatus> =>
  invoke("get_connection_status", { sessionId });

// Driver capability commands
export const listDrivers = (): Promise<DriverInfo[]> =>
  invoke("list_drivers");

export const getDriverCapabilities = (dbType: string): Promise<DriverCapabilities> =>
  invoke("get_driver_capabilities", { dbType });

// Query commands
export const executeQuery = (sessionId: string, sql: string, params?: string[]): Promise<QueryResult> =>
  invoke("execute_query", { sessionId, sql, params });

export const fetchRows = (sessionId: string, table: string, schema: string | null, offset: number, limit: number): Promise<QueryResult> =>
  invoke("fetch_rows", { sessionId, table, schema, offset, limit });

export const fetchRowsFiltered = (
  sessionId: string, table: string, schema: string | null,
  offset: number, limit: number,
  whereClause: string | null, orderBy: string | null,
): Promise<QueryResult> =>
  invoke("fetch_rows", { sessionId, table, schema, whereClause, orderBy, offset, limit });

export const fetchCount = (sessionId: string, table: string): Promise<number> =>
  invoke("fetch_count", { sessionId, table });

export const fetchCountFiltered = (
  sessionId: string, table: string, schema: string | null, whereClause: string | null,
): Promise<number> =>
  invoke("fetch_count", { sessionId, table, schema, whereClause });

export const cancelQuery = (sessionId: string): Promise<void> =>
  invoke("cancel_query", { sessionId });

export const historyRecord = (
  query: string,
  database: string | null,
  executionTimeMs: number,
  rowCount: number,
  status: string,
): Promise<void> =>
  invoke("history_record", { query, database, executionTimeMs, rowCount, status });

// Schema commands
export const fetchTables = (sessionId: string): Promise<TableInfo[]> =>
  invoke("fetch_tables", { sessionId });

export const fetchColumns = (sessionId: string, table: string, schema?: string): Promise<ColumnInfo[]> =>
  invoke("fetch_columns", { sessionId, table, schema });

export const fetchIndexes = (sessionId: string, table: string, schema?: string): Promise<IndexInfo[]> =>
  invoke("fetch_indexes", { sessionId, table, schema });

export const fetchForeignKeys = (sessionId: string, table: string, schema?: string): Promise<ForeignKeyInfo[]> =>
  invoke("fetch_foreign_keys", { sessionId, table, schema });

export const fetchRoutines = (sessionId: string): Promise<RoutineCatalog> =>
  invoke("fetch_routines", { sessionId });

export const fetchDatabases = (sessionId: string): Promise<string[]> =>
  invoke("fetch_databases", { sessionId });

export const switchDatabase = (sessionId: string, database: string): Promise<void> =>
  invoke("switch_database", { sessionId, database });

export const fetchDdl = (sessionId: string, table: string, schema?: string): Promise<string> =>
  invoke("fetch_ddl", { sessionId, table, schema });

export interface CreateTableColumnDefinition {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  autoIncrement: boolean;
}

export interface CreateTableDefinition {
  tableName: string;
  schema?: string;
  columns: CreateTableColumnDefinition[];
}

export interface CreateTableResult {
  ddl: string;
}

export const createTable = (
  sessionId: string,
  tableDefinition: CreateTableDefinition,
): Promise<CreateTableResult> =>
  invoke("create_table", { sessionId, tableDefinition });

export const fetchEnumValues = (
  sessionId: string,
  table: string,
  column: string,
  schema: string | null,
): Promise<string[]> =>
  invoke("fetch_enum_values", { sessionId, table, column, schema });

export const fetchApproximateCount = (
  sessionId: string,
  table: string,
  schema: string | null,
): Promise<number> =>
  invoke("fetch_approximate_count", { sessionId, table, schema });

// Schema commands (PostgreSQL)
export const fetchSchemas = (sessionId: string): Promise<string[]> =>
  invoke("fetch_schemas", { sessionId });

// Import commands
export interface ImportPreview {
  statementCount: number;
  fileSizeBytes: number;
  firstStatements: string[];
}
export interface ImportOptions {
  wrapInTransaction: boolean;
  disableFkChecks: boolean;
}
export interface ImportResultData {
  statementsExecuted: number;
  durationMs: number;
}
export const importPreview = (path: string): Promise<ImportPreview> =>
  invoke("import_preview", { path });
export const importSqlFile = (
  sessionId: string, path: string, options: ImportOptions,
): Promise<ImportResultData> =>
  invoke("import_sql_file", { sessionId, path, options });

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

// Connection group commands
export const listGroups = (): Promise<ConnectionGroup[]> =>
  invoke("list_groups");

export const saveGroup = (group: ConnectionGroup): Promise<void> =>
  invoke("save_group", { group });

export const deleteGroup = (id: string): Promise<void> =>
  invoke("delete_group", { id });

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

export type RowSqlFormat = 'INSERT' | 'UPDATE';

export interface GenerateRowSqlPayload {
  table: string;
  schema: string | null;
  columns: string[];
  primaryKeys: string[];
  rows: (string | number | boolean | null | Record<string, unknown> | unknown[])[][];
  outputFormat: RowSqlFormat;
}

export const generateRowSql = (
  sessionId: string,
  payload: GenerateRowSqlPayload,
): Promise<string> => invoke('generate_row_sql', { sessionId, payload });

// Structure alter commands
export interface AlterColumnDef {
  name: string;
  typeName: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  position: number;
}

export interface AlterColumnChange {
  changeType: 'add_column' | 'modify_column' | 'drop_column';
  columnName: string;
  before?: AlterColumnDef;
  after?: AlterColumnDef;
}

export interface GenerateAlterSqlPayload {
  table: string;
  schema: string | null | undefined;
  changes: AlterColumnChange[];
}

export const generateAlterSql = (
  sessionId: string,
  payload: GenerateAlterSqlPayload,
): Promise<string[]> =>
  invoke('generate_alter_sql_command', { sessionId, payload });

export const applyAlter = (
  sessionId: string,
  payload: GenerateAlterSqlPayload,
): Promise<void> =>
  invoke('apply_alter', { sessionId, payload });
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

// EXPLAIN query types
export interface ExplainNode {
  operation: string;
  detail: string;
  cost: number | null;
  rows: number | null;
  children: ExplainNode[];
}

export interface ExplainResult {
  format: string;
  raw: string;
  nodes: ExplainNode[];
}

export const explainQuery = (sessionId: string, sql: string): Promise<ExplainResult> =>
  invoke('explain_query', { sessionId, sql });

// ── Routine operations (dev-2) ──────────────────────────────────────────
export interface RoutineParam {
  name: string;
  value: string | null;
  paramType: string | null;
}

export interface RoutineResult {
  resultSet: QueryResult | null;
  outputParams: [string, unknown][];
}

export const getRoutineSource = (
  sessionId: string,
  routineName: string,
  routineSchema: string | null,
  routineKind: string,
): Promise<string> =>
  invoke('get_routine_source', { sessionId, routineName, routineSchema, routineKind });

export const executeRoutine = (
  sessionId: string,
  routineName: string,
  routineSchema: string | null,
  routineKind: string,
  params: RoutineParam[],
): Promise<RoutineResult> =>
  invoke('execute_routine', { sessionId, routineName, routineSchema, routineKind, params });

export const previewRoutineSql = (
  sessionId: string,
  routineName: string,
  routineSchema: string | null,
  routineKind: string,
  params: RoutineParam[],
): Promise<string> =>
  invoke('preview_routine_sql', { sessionId, routineName, routineSchema, routineKind, params });

// ── Bulk operations (dev-1) ──────────────────────────────────────────────

export interface BulkResult {
  rowsAffected: number;
  batchesExecuted: number;
  durationMs: number;
}

export interface FilterCondition {
  column: string;
  operator: string;
  value: string | null;
}

export const bulkInsert = (
  sessionId: string,
  table: string,
  schema: string | null,
  columns: string[],
  rows: (string | null)[][],
): Promise<BulkResult> =>
  invoke('bulk_insert', { sessionId, table, schema, columns, rows });

export const bulkUpdatePreview = (
  sessionId: string,
  table: string,
  schema: string | null,
  filters: FilterCondition[],
): Promise<number> =>
  invoke('bulk_update_preview', { sessionId, table, schema, filters });

export const bulkUpdate = (
  sessionId: string,
  table: string,
  schema: string | null,
  column: string,
  value: string | null,
  filters: FilterCondition[],
): Promise<BulkResult> =>
  invoke('bulk_update', { sessionId, table, schema, column, value, filters });
