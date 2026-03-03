export interface CellUpdate {
  rowIndex: number;
  column: string;
  originalValue: string | null;
  newValue: string | null;
}

export interface RowInsert {
  values: Record<string, string | null>;
}

export interface TabChanges {
  updates: CellUpdate[];
  inserts: RowInsert[];
  deletes: Set<number>;
}

export interface ChangeSet {
  updates: Array<{
    row_index: number;
    column: string;
    original_value: string | null;
    new_value: string | null;
  }>;
  inserts: Array<{
    values: Record<string, string | null>;
  }>;
  deletes: Array<{
    primary_key_values: Record<string, string>;
  }>;
  primary_key_columns: string[];
  primary_key_values: Record<number, Record<string, string>>;
}

export interface UndoRedoEntry {
  type: "cell_edit" | "row_insert" | "row_delete";
  data: CellUpdate | RowInsert | { rowIndex: number };
}
