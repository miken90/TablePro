export interface ColumnInfo {
  name: string;
  typeName: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: (string | null)[][];
  affectedRows: number;
  executionTimeMs: number;
  /** True when the backend truncated rows to fit within IPC payload limits. */
  truncated?: boolean;
  /** Original row count before truncation (only set when truncated is true). */
  totalRowCount?: number;
}
