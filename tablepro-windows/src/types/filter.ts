export type FilterOperator =
  | "eq"
  | "not_eq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "like"
  | "not_like"
  | "in"
  | "not_in"
  | "is_null"
  | "is_not_null"
  | "between";

export type LogicalOp = "and" | "or";

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: string | null;
  value2: string | null;
  logical_op: LogicalOp;
}

export interface FilterPreset {
  name: string;
  conditions: FilterCondition[];
}

export const FILTER_OPERATORS: { value: FilterOperator; label: string; needsValue: boolean; needsValue2: boolean }[] = [
  { value: "eq", label: "=", needsValue: true, needsValue2: false },
  { value: "not_eq", label: "!=", needsValue: true, needsValue2: false },
  { value: "gt", label: ">", needsValue: true, needsValue2: false },
  { value: "lt", label: "<", needsValue: true, needsValue2: false },
  { value: "gte", label: ">=", needsValue: true, needsValue2: false },
  { value: "lte", label: "<=", needsValue: true, needsValue2: false },
  { value: "like", label: "LIKE", needsValue: true, needsValue2: false },
  { value: "not_like", label: "NOT LIKE", needsValue: true, needsValue2: false },
  { value: "in", label: "IN", needsValue: true, needsValue2: false },
  { value: "not_in", label: "NOT IN", needsValue: true, needsValue2: false },
  { value: "is_null", label: "IS NULL", needsValue: false, needsValue2: false },
  { value: "is_not_null", label: "IS NOT NULL", needsValue: false, needsValue2: false },
  { value: "between", label: "BETWEEN", needsValue: true, needsValue2: true },
];
