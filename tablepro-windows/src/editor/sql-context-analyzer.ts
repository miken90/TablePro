/**
 * SQL context analyzer — port of SQLContextAnalyzer.swift.
 * Analyzes SQL text + cursor position to determine which clause the cursor is in.
 */

import { locatedStatementAtCursor } from './statement-scanner';
import type { SQLContext, TableReference } from './sql-completion-types';
import { SQLClauseType } from './sql-completion-types';
import {
  isInsideString,
  isInsideComment,
  removeStringsAndComments,
  extractPrefix,
  calculateNestingLevel,
  extractInnermostSubqueryText,
  detectFunctionContext,
  checkIfAfterComma,
} from './sql-token-utils';

// ---------------------------------------------------------------------------
// Clause detection regex patterns — ORDER MATTERS (more specific first)
// ---------------------------------------------------------------------------
type ClausePattern = { re: RegExp; clause: SQLClauseType };

const CLAUSE_PATTERNS: ClausePattern[] = [
  // DDL — most specific first
  {
    re: /\bADD\s+(?:COLUMN\s+)?[`"']?\w+[`"']?\s+\w+.*?\b(?:AFTER|BEFORE)(?:\s+\w*)?$/i,
    clause: SQLClauseType.AlterTableColumn,
  },
  { re: /\b(?:AFTER|BEFORE)(?:\s+\w*)?$/i, clause: SQLClauseType.AlterTableColumn },
  { re: /\bFIRST\s*$/i, clause: SQLClauseType.AlterTable },
  {
    re: /\bALTER\s+TABLE\s+[`"']?\w+[`"']?\s+ADD\s+CONSTRAINT\s+\w*$/i,
    clause: SQLClauseType.AlterTable,
  },
  {
    re: /\bALTER\s+TABLE\s+[`"']?\w+[`"']?\s+ADD\s+\w*$/i,
    clause: SQLClauseType.AlterTable,
  },
  {
    re: /\b(?:ADD|MODIFY|CHANGE)\s+(?:COLUMN\s+)?[`"']?\w+[`"']?\s+\w+(?:\([^)]*\))?(?:\s+(?:NOT\s+)?NULL|\s+DEFAULT(?:\s+[^\s]+)?|\s+AUTO_INCREMENT|\s+UNSIGNED|\s+COMMENT(?:\s+'[^']*')?)*\s*$/i,
    clause: SQLClauseType.ColumnDef,
  },
  { re: /\b(?:ADD|MODIFY|CHANGE)\s+COLUMN\s+\w+\s*$/i, clause: SQLClauseType.ColumnDef },
  {
    re: /\bALTER\s+TABLE\s+[`"']?\w+[`"']?\s+(?:DROP|MODIFY|CHANGE|RENAME)\s+(?:COLUMN\s+)?[`"']?\w*[`"']?\s*$/i,
    clause: SQLClauseType.AlterTableColumn,
  },
  { re: /\bALTER\s+TABLE\s+[`"']?\w+[`"']?\s+\w*$/i, clause: SQLClauseType.AlterTable },
  { re: /\bCREATE\s+TABLE\s+[^(]*\([^)]*$/i, clause: SQLClauseType.CreateTable },
  {
    re: /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+[^;]*\([^)]*\)\s*\w*$/i,
    clause: SQLClauseType.CreateTable,
  },
  {
    re: /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\w*$/i,
    clause: SQLClauseType.CreateTable,
  },
  // DROP
  {
    re: /\bDROP\s+(?:TABLE|VIEW|INDEX)\s+(?:IF\s+EXISTS\s+)?\w*$/i,
    clause: SQLClauseType.DropObject,
  },
  // CREATE INDEX
  {
    re: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+\w+\s*\([^)]*$/i,
    clause: SQLClauseType.CreateIndex,
  },
  { re: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\w*$/i, clause: SQLClauseType.CreateIndex },
  // CREATE VIEW
  {
    re: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+\w+\s+AS\s+[^;]*$/i,
    clause: SQLClauseType.CreateView,
  },
  {
    re: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+\w*$/i,
    clause: SQLClauseType.CreateView,
  },
  // RETURNING
  { re: /\bRETURNING\s+[^;]*$/i, clause: SQLClauseType.Returning },
  // UNION / INTERSECT / EXCEPT
  { re: /\b(?:UNION|INTERSECT|EXCEPT)\s+(?:ALL\s+)?\w*$/i, clause: SQLClauseType.Union },
  // USING
  { re: /\bUSING\s*\([^)]*$/i, clause: SQLClauseType.Using },
  // OVER / PARTITION BY
  { re: /\bOVER\s*\([^)]*$/i, clause: SQLClauseType.Window },
  { re: /\bPARTITION\s+BY\s+[^)]*$/i, clause: SQLClauseType.Window },
  // IN list
  { re: /\bIN\s*\([^)]*$/i, clause: SQLClauseType.InList },
  // CASE expression
  { re: /\bCASE\s+(?:WHEN\s+[^;]*)?$/i, clause: SQLClauseType.CaseExpression },
  // LIMIT / OFFSET
  { re: /\b(?:LIMIT|OFFSET)\s+\d*$/i, clause: SQLClauseType.Limit },
  // VALUES
  { re: /\bVALUES\s*(?:\([^)]*\)\s*,?\s*)+\w*$/i, clause: SQLClauseType.Values },
  { re: /\bVALUES\s*\([^)]*$/i, clause: SQLClauseType.Values },
  // INSERT INTO
  { re: /\bINSERT\s+INTO\s+\w+\s*\([^)]*$/i, clause: SQLClauseType.InsertColumns },
  { re: /\bINSERT\s+INTO\s+[`"']?\w+[`"']?\s*$/i, clause: SQLClauseType.Into },
  { re: /\bINTO\s+\w*$/i, clause: SQLClauseType.Into },
  // SET (UPDATE)
  { re: /\bSET\s+[^;]*$/i, clause: SQLClauseType.Set },
  // HAVING / ORDER BY / GROUP BY
  { re: /\bHAVING\s+[^;]*$/i, clause: SQLClauseType.Having },
  { re: /\bORDER\s+BY\s+[^;]*$/i, clause: SQLClauseType.OrderBy },
  { re: /\bGROUP\s+BY\s+[^;]*$/i, clause: SQLClauseType.GroupBy },
  // AND / OR
  { re: /\b(?:AND|OR)\s+\w*$/i, clause: SQLClauseType.And },
  // WHERE / ON
  { re: /\bWHERE\s+[^;]*$/i, clause: SQLClauseType.Where },
  { re: /\bON\s+[^;]*$/i, clause: SQLClauseType.On },
  // JOIN
  {
    re: /(?:LEFT|RIGHT|INNER|OUTER|FULL|CROSS)?(?:\s+OUTER)?\s*JOIN\s+[`"']?\w+[`"']?(?:\s+(?:AS\s+)?\w+)?\s*$/i,
    clause: SQLClauseType.Join,
  },
  { re: /\bJOIN\s+[`"']?\w*[`"']?\s*$/i, clause: SQLClauseType.Join },
  // FROM
  {
    re: /\bFROM\s+[`"']?\w+[`"']?(?:\s+(?:AS\s+)?\w+)?\s*$/i,
    clause: SQLClauseType.From,
  },
  { re: /\bFROM\s+\w*$/i, clause: SQLClauseType.From },
  { re: /\bFROM\s*$/i, clause: SQLClauseType.From },
  // SELECT (most general)
  { re: /\bSELECT\s+[^;]*$/i, clause: SQLClauseType.Select },
];

// Regex for CTE names
const CTE_FIRST_RE = /\bWITH\s+(?:RECURSIVE\s+)?(\w+)\s+AS\s*\(/gi;
const CTE_COMMA_RE = /,\s*(\w+)\s+AS\s*\(/gi;

// Table reference patterns
const TABLE_REF_PATTERNS: RegExp[] = [
  /\bFROM\s+[`"']?(\w+)[`"']?(?:\s+(?:AS\s+)?[`"']?(\w+)[`"']?)?/gi,
  /\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|FULL)?(?:\s+OUTER)?\s*JOIN\s+[`"']?(\w+)[`"']?(?:\s+(?:AS\s+)?[`"']?(\w+)[`"']?)?/gi,
  /\bUPDATE\s+[`"']?(\w+)[`"']?(?:\s+(?:AS\s+)?[`"']?(\w+)[`"']?)?/gi,
  /\bINSERT\s+INTO\s+[`"']?(\w+)[`"']?/gi,
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+[`"']?(\w+)[`"']?/gi,
];

const ALTER_TABLE_RE = /\bALTER\s+TABLE\s+[`"']?(\w+)[`"']?/i;

const SQL_KEYWORDS_SET = new Set([
  'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'NATURAL',
  'JOIN', 'ON', 'AND', 'OR', 'WHERE', 'SELECT', 'FROM', 'AS',
]);

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Extract all table references from a SQL statement. */
function extractTableReferences(query: string): TableReference[] {
  const references: TableReference[] = [];

  for (const re of TABLE_REF_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(query)) !== null) {
      const tableName = m[1];
      if (!tableName || SQL_KEYWORDS_SET.has(tableName.toUpperCase())) continue;
      const aliasRaw = m[2] ?? null;
      const alias =
        aliasRaw && !SQL_KEYWORDS_SET.has(aliasRaw.toUpperCase()) ? aliasRaw : null;
      const ref: TableReference = { tableName, alias };
      const dup = references.some(
        (r) => r.tableName === ref.tableName && r.alias === ref.alias,
      );
      if (!dup) references.push(ref);
    }
  }

  return references;
}

/** Extract CTE names (WITH ... AS (...)) from a query. */
function extractCTENames(query: string): string[] {
  const names: string[] = [];
  CTE_FIRST_RE.lastIndex = 0;
  let m = CTE_FIRST_RE.exec(query);
  if (m) names.push(m[1]);

  CTE_COMMA_RE.lastIndex = 0;
  while ((m = CTE_COMMA_RE.exec(query)) !== null) {
    names.push(m[1]);
  }

  return names;
}

/** Extract table name from ALTER TABLE statement. */
function extractAlterTableName(query: string): string | null {
  const m = ALTER_TABLE_RE.exec(query);
  return m ? m[1] : null;
}

/** Determine clause type from text-before-cursor. */
function determineClauseType(
  textBeforeCursor: string,
  dotPrefix: string | null,
  currentFunction: string | null,
): SQLClauseType {
  if (dotPrefix !== null) return SQLClauseType.Select;

  const WINDOW_SIZE = 5000;
  const windowed =
    textBeforeCursor.length > WINDOW_SIZE
      ? textBeforeCursor.slice(textBeforeCursor.length - WINDOW_SIZE)
      : textBeforeCursor;

  const cleaned = removeStringsAndComments(windowed);

  for (const { re, clause } of CLAUSE_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(cleaned)) return clause;
  }

  if (currentFunction !== null) return SQLClauseType.FunctionArg;

  return SQLClauseType.Unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze the SQL query at the given cursor position and return an SQLContext
 * describing the clause type, prefix, table references, and other metadata.
 */
export function analyzeSQLContext(query: string, cursorPosition: number): SQLContext {
  const safePosition = Math.min(cursorPosition, query.length);

  const located = locatedStatementAtCursor(query, safePosition);
  const currentStatement = located.sql;
  const statementOffset = located.offset;
  const adjustedPosition = safePosition - statementOffset;
  const clampedPosition = Math.max(0, Math.min(adjustedPosition, currentStatement.length));
  const textBeforeCursor = currentStatement.slice(0, clampedPosition);

  if (isInsideString(textBeforeCursor)) {
    return {
      clauseType: SQLClauseType.Unknown,
      prefix: '',
      prefixRange: { from: safePosition, to: safePosition },
      dotPrefix: null,
      tableReferences: [],
      isInsideString: true,
      isInsideComment: false,
      cteNames: [],
      nestingLevel: 0,
      currentFunction: null,
      isAfterComma: false,
    };
  }

  if (isInsideComment(textBeforeCursor)) {
    return {
      clauseType: SQLClauseType.Unknown,
      prefix: '',
      prefixRange: { from: safePosition, to: safePosition },
      dotPrefix: null,
      tableReferences: [],
      isInsideString: false,
      isInsideComment: true,
      cteNames: [],
      nestingLevel: 0,
      currentFunction: null,
      isAfterComma: false,
    };
  }

  const { prefix, start: prefixStart, dotPrefix } = extractPrefix(textBeforeCursor);

  const tableReferences = extractTableReferences(currentStatement);
  const cteNames = extractCTENames(currentStatement);

  for (const cteName of cteNames) {
    const dup = tableReferences.some((r) => r.tableName === cteName);
    if (!dup) tableReferences.push({ tableName: cteName, alias: null });
  }

  const alterTableName = extractAlterTableName(currentStatement);
  if (alterTableName) {
    const dup = tableReferences.some((r) => r.tableName === alterTableName);
    if (!dup) tableReferences.push({ tableName: alterTableName, alias: null });
  }

  const nestingLevel = calculateNestingLevel(textBeforeCursor);
  const currentFunction = detectFunctionContext(textBeforeCursor);
  const isAfterComma = checkIfAfterComma(textBeforeCursor);

  const clauseText =
    nestingLevel > 0 ? extractInnermostSubqueryText(textBeforeCursor) : textBeforeCursor;

  const clauseType = determineClauseType(clauseText, dotPrefix, currentFunction);

  return {
    clauseType,
    prefix,
    prefixRange: { from: statementOffset + prefixStart, to: safePosition },
    dotPrefix,
    tableReferences,
    isInsideString: false,
    isInsideComment: false,
    cteNames,
    nestingLevel,
    currentFunction,
    isAfterComma,
  };
}


