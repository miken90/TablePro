export interface TableInfo {
  name: string;
  schema: string | null;
  tableType: string;
  rowCountEstimate: number | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  indexType: string;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

export type RoutineKind = 'function' | 'procedure';

export interface RoutineInfo {
  name: string;
  schema: string | null;
  kind: RoutineKind;
  signature: string | null;
  returnType: string | null;
  isTableValued: boolean;
}

export interface RoutineCatalog {
  supported: boolean;
  reason: string | null;
  items: RoutineInfo[];
}
