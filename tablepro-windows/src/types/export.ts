export type ExportFormat = "csv" | "json" | "sql" | "xlsx";

export interface ExportOptions {
  format: ExportFormat;
  file_path: string;
  table_name: string | null;
  include_headers: boolean;
  delimiter: string | null;
  pretty: boolean | null;
  db_type: string | null;
}

export interface ImportResult {
  total_statements: number;
  successful: number;
  failed: number;
  errors: string[];
}
