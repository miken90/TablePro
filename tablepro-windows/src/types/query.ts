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
}
