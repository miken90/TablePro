export type FilterOperator =
  | '=' | '!=' | '>' | '<' | '>=' | '<='
  | 'LIKE' | 'NOT LIKE'
  | 'IS NULL' | 'IS NOT NULL'
  | 'IN' | 'BETWEEN';

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
  enabled: boolean;
}

export type FilterLogic = 'AND' | 'OR';

export const ALL_OPERATORS: FilterOperator[] = [
  '=', '!=', '>', '<', '>=', '<=',
  'LIKE', 'NOT LIKE',
  'IS NULL', 'IS NOT NULL',
  'IN', 'BETWEEN',
];

/** Operators that don't need a value input */
export const UNARY_OPERATORS: FilterOperator[] = ['IS NULL', 'IS NOT NULL'];

/** Build WHERE clause from conditions */
export function buildWhereClause(
  conditions: FilterCondition[],
  logic: FilterLogic,
): string {
  const active = conditions.filter((c) => c.enabled && c.column);
  if (active.length === 0) return '';

  const parts = active.map((c) => {
    if (UNARY_OPERATORS.includes(c.operator)) {
      return `"${c.column}" ${c.operator}`;
    }
    const escaped = c.value.replace(/'/g, "''");
    if (c.operator === 'IN') {
      // User provides comma-separated values; pass through
      return `"${c.column}" IN (${c.value})`;
    }
    if (c.operator === 'BETWEEN') {
      const [a, b] = c.value.split(',').map((s) => s.trim());
      const ea = (a ?? '').replace(/'/g, "''");
      const eb = (b ?? '').replace(/'/g, "''");
      return `"${c.column}" BETWEEN '${ea}' AND '${eb}'`;
    }
    return `"${c.column}" ${c.operator} '${escaped}'`;
  });

  return parts.join(` ${logic} `);
}
