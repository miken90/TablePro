/**
 * Smart filter parser — converts `column:operator?value` syntax into
 * structured conditions and parameterized SQL WHERE clauses.
 *
 * Security: all user values are passed as parameters, never interpolated.
 * Column names are validated against an allowlist before use in SQL.
 */

export type ParsedOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'starts'
  | 'ends';

export interface ParsedFilterCondition {
  column?: string;
  operator: ParsedOperator;
  value: string;
}

/** Max length for a single filter value — truncate silently */
const MAX_VALUE_LENGTH = 256;

/**
 * Pattern: optional column name + colon + optional operator + value
 * Examples:
 *   "status:active"     → column=status, op='=',        value=active
 *   "age:>25"           → column=age,    op='>',         value=25
 *   "name:!=john"       → column=name,   op='!=',        value=john
 *   "name:>=alice"      → column=name,   op='>=',        value=alice
 *   "john"              → no column,     op='contains',  value=john
 */
const COLUMN_PATTERN = /^(\w+):(!=|>=|<=|>|<|=)?(.+)$/;

const OPERATOR_MAP: Record<string, ParsedOperator> = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '<': '<',
  '>=': '>=',
  '<=': '<=',
};

function sanitizeValue(raw: string): string {
  return raw.trim().slice(0, MAX_VALUE_LENGTH);
}

/**
 * Parse a filter query string into structured conditions.
 *
 * Syntax:
 * - `column:value`          → equality match on named column
 * - `column:>value`         → comparison on named column
 * - `column:!=value`        → not-equal on named column
 * - `text`                  → full-text contains on all columns
 * - `cond1 AND cond2`       → multiple conditions (case-insensitive)
 *
 * Unrecognized operators fall back to `contains`.
 */
export function parseFilterQuery(query: string): ParsedFilterCondition[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/\s+AND\s+/i);
  const conditions: ParsedFilterCondition[] = [];

  for (const part of parts) {
    const segment = part.trim();
    if (!segment) continue;

    const match = segment.match(COLUMN_PATTERN);
    if (match) {
      const column = match[1];
      const rawOp = match[2] ?? '=';
      const value = sanitizeValue(match[3]);

      if (!value) continue;

      const operator: ParsedOperator = OPERATOR_MAP[rawOp] ?? 'contains';

      conditions.push({ column, operator, value });
    } else {
      // Plain text — full-text contains
      const value = sanitizeValue(segment);
      if (value) {
        conditions.push({ operator: 'contains', value });
      }
    }
  }

  return conditions;
}

/** Escape LIKE special characters to prevent unintended wildcard expansion */
function escapeLikeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Build a parameterized WHERE clause from parsed conditions.
 *
 * SECURITY:
 * - Column names are validated against the allowedColumns allowlist
 * - Values are passed as positional `?` parameters, NEVER interpolated
 * - LIKE patterns have `%`, `_`, `\` escaped before binding
 *
 * Returns `{ clause, params }` — pass `params` to your query executor.
 */
export function buildWhereClause(
  conditions: ParsedFilterCondition[],
  allowedColumns: string[],
): { clause: string; params: string[] } {
  if (conditions.length === 0) return { clause: '', params: [] };

  const allowedSet = new Set(allowedColumns);
  const parts: string[] = [];
  const params: string[] = [];

  for (const cond of conditions) {
    if (cond.column !== undefined) {
      // Validate column against allowlist — reject unknown columns
      if (!allowedSet.has(cond.column)) continue;

      const quotedCol = `"${cond.column}"`;

      switch (cond.operator) {
        case '=':
        case '!=':
        case '>':
        case '<':
        case '>=':
        case '<=':
          parts.push(`${quotedCol} ${cond.operator} ?`);
          params.push(cond.value);
          break;

        case 'contains': {
          const escaped = escapeLikeValue(cond.value);
          parts.push(`${quotedCol} LIKE ? ESCAPE '\\'`);
          params.push(`%${escaped}%`);
          break;
        }

        case 'starts': {
          const escaped = escapeLikeValue(cond.value);
          parts.push(`${quotedCol} LIKE ? ESCAPE '\\'`);
          params.push(`${escaped}%`);
          break;
        }

        case 'ends': {
          const escaped = escapeLikeValue(cond.value);
          parts.push(`${quotedCol} LIKE ? ESCAPE '\\'`);
          params.push(`%${escaped}`);
          break;
        }
      }
    } else {
      // Full-text: search all allowed columns with contains
      if (allowedColumns.length === 0) continue;

      const escaped = escapeLikeValue(cond.value);
      const colParts = allowedColumns.map((col) => `"${col}" LIKE ? ESCAPE '\\'`);
      parts.push(`(${colParts.join(' OR ')})`);
      for (let i = 0; i < allowedColumns.length; i++) {
        params.push(`%${escaped}%`);
      }
    }
  }

  if (parts.length === 0) return { clause: '', params: [] };

  return { clause: parts.join(' AND '), params };
}

/** Format a condition for display in a chip label */
export function formatConditionLabel(cond: ParsedFilterCondition): string {
  if (!cond.column) return cond.value;

  const opDisplay: Record<ParsedOperator, string> = {
    '=': '=',
    '!=': '≠',
    '>': '>',
    '<': '<',
    '>=': '≥',
    '<=': '≤',
    contains: '~',
    starts: '^',
    ends: '$',
  };

  return `${cond.column} ${opDisplay[cond.operator]} ${cond.value}`;
}
