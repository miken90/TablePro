/**
 * SQL context analyzer — port of SQLContextAnalyzer.swift.
 * Analyzes SQL text + cursor position to determine which clause the cursor is in.
 */

import { locatedStatementAtCursor } from './statement-scanner';
import type { SQLContext, TableReference } from './sql-completion-types';
import { SQLClauseType } from './sql-completion-types';

// ---------------------------------------------------------------------------
// Character code constants (replaces Swift UTF-16 constants)
// ---------------------------------------------------------------------------
const CC_SINGLE_QUOTE = "'".charCodeAt(0);
const CC_DOUBLE_QUOTE = '"'.charCodeAt(0);
const CC_BACKTICK = '`'.charCodeAt(0);
const CC_BACKSLASH = '\\'.charCodeAt(0);
const CC_OPEN_PAREN = '('.charCodeAt(0);
const CC_CLOSE_PAREN = ')'.charCodeAt(0);
const CC_DOT = '.'.charCodeAt(0);
const CC_UNDERSCORE = '_'.charCodeAt(0);
const CC_COMMA = ','.charCodeAt(0);
const CC_SPACE = ' '.charCodeAt(0);
const CC_TAB = '\t'.charCodeAt(0);
const CC_NEWLINE = '\n'.charCodeAt(0);
const CC_CR = '\r'.charCodeAt(0);
const CC_SLASH = '/'.charCodeAt(0);
const CC_STAR = '*'.charCodeAt(0);
const CC_DASH = '-'.charCodeAt(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIdentifierChar(ch: number): boolean {
  return (
    (ch >= 0x41 && ch <= 0x5a) || // A-Z
    (ch >= 0x61 && ch <= 0x7a) || // a-z
    (ch >= 0x30 && ch <= 0x39) || // 0-9
    ch === CC_UNDERSCORE
  );
}

function isWhitespace(ch: number): boolean {
  return ch === CC_SPACE || ch === CC_TAB || ch === CC_NEWLINE || ch === CC_CR;
}

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

// Combined regex for removing strings and comments in one pass
const STRINGS_COMMENTS_RE =
  /'[^']*'|"[^"]*"|\/\*[\s\S]*?\*\/|--[^\n]*/g;

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

const SUBQUERY_DETECT_RE = /^\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/i;

const SQL_KEYWORDS_SET = new Set([
  'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'NATURAL',
  'JOIN', 'ON', 'AND', 'OR', 'WHERE', 'SELECT', 'FROM', 'AS',
]);

// SQL functions recognized in detectFunctionContext
const KNOWN_SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'IFNULL',
  'CONCAT', 'SUBSTRING', 'UPPER', 'LOWER', 'NOW', 'DATE',
  'CAST', 'CONVERT', 'ROUND', 'ABS', 'LENGTH', 'TRIM',
  'GROUP_CONCAT', 'DATE_FORMAT', 'YEAR', 'MONTH', 'DAY',
]);

const SUBQUERY_KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'IN', 'EXISTS', 'NOT']);

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Check if text-before-cursor is inside a string literal. */
function isInsideString(text: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let prev = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === CC_SINGLE_QUOTE && prev !== CC_BACKSLASH && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === CC_DOUBLE_QUOTE && prev !== CC_BACKSLASH && !inSingle) {
      inDouble = !inDouble;
    }
    prev = ch;
  }
  return inSingle || inDouble;
}

/** Check if text-before-cursor ends inside a comment. */
function isInsideComment(text: string): boolean {
  let blockDepth = 0;
  let lastBlockEnd = -1;
  let i = 0;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (blockDepth > 0) {
      if (ch === CC_STAR && i + 1 < text.length && text.charCodeAt(i + 1) === CC_SLASH) {
        blockDepth--;
        if (blockDepth === 0) lastBlockEnd = i + 2;
        i += 2;
        continue;
      }
    } else {
      if (ch === CC_SLASH && i + 1 < text.length && text.charCodeAt(i + 1) === CC_STAR) {
        blockDepth++;
        i += 2;
        continue;
      }
    }
    i++;
  }
  if (blockDepth > 0) return true;

  const lastNewline = text.lastIndexOf('\n');
  const lineStart = Math.max(lastNewline + 1, Math.max(lastBlockEnd, 0));
  if (lineStart >= text.length) return false;
  const currentLine = text.slice(lineStart);
  const dashIdx = currentLine.indexOf('--');
  if (dashIdx !== -1) {
    const before = currentLine.slice(0, dashIdx);
    if (!isInsideString(before)) return true;
  }
  return false;
}

/** Remove string literals and comments for clause analysis. */
function removeStringsAndComments(text: string): string {
  return text.replace(STRINGS_COMMENTS_RE, (match) => {
    if (match.startsWith("'")) return "''";
    if (match.startsWith('"')) return '""';
    return '';
  });
}

/**
 * Scan backward from end of text to extract identifier prefix and optional dot-prefix.
 * Returns { prefix, start, dotPrefix }.
 */
function extractPrefix(text: string): { prefix: string; start: number; dotPrefix: string | null } {
  if (text.length === 0) return { prefix: '', start: 0, dotPrefix: null };

  let prefixStart = text.length;
  let foundDot = false;
  let dotPosition = -1;

  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text.charCodeAt(i);
    if (ch === CC_DOT && !foundDot) {
      foundDot = true;
      dotPosition = i;
      continue;
    }
    if (isIdentifierChar(ch) || ch === CC_BACKTICK || ch === CC_DOUBLE_QUOTE) {
      prefixStart = i;
    } else {
      break;
    }
  }

  if (foundDot && dotPosition > prefixStart) {
    const beforeDot = text.slice(prefixStart, dotPosition).replace(/[`"]/g, '');
    const afterDot = text.slice(dotPosition + 1);
    return { prefix: afterDot, start: dotPosition + 1, dotPrefix: beforeDot };
  }

  const prefix = text.slice(prefixStart);
  return { prefix, start: prefixStart, dotPrefix: null };
}

/** Count unmatched open parentheses (subquery nesting level). */
function calculateNestingLevel(text: string): number {
  let level = 0;
  let inString = false;
  let prev = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === CC_SINGLE_QUOTE && prev !== CC_BACKSLASH) {
      inString = !inString;
    }
    if (!inString) {
      if (ch === CC_OPEN_PAREN) level++;
      else if (ch === CC_CLOSE_PAREN) level = Math.max(0, level - 1);
    }
    prev = ch;
  }
  return level;
}

/**
 * Find the innermost subquery text (text after the innermost open paren that
 * starts a SELECT/INSERT/UPDATE/DELETE).
 */
function extractInnermostSubqueryText(text: string): string {
  const parenStack: number[] = [];
  let inString = false;
  let prev = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === CC_SINGLE_QUOTE && prev !== CC_BACKSLASH) {
      inString = !inString;
    }
    if (!inString) {
      if (ch === CC_OPEN_PAREN) {
        parenStack.push(i);
      } else if (ch === CC_CLOSE_PAREN && parenStack.length > 0) {
        parenStack.pop();
      }
    }
    prev = ch;
  }

  // Walk from innermost open paren outward
  for (let idx = parenStack.length - 1; idx >= 0; idx--) {
    const openPos = parenStack[idx];
    const subText = text.slice(openPos + 1);
    if (SUBQUERY_DETECT_RE.test(subText)) {
      return subText;
    }
  }

  return text;
}

/**
 * Detect if cursor is inside a function call; return function name or null.
 */
function detectFunctionContext(text: string): string | null {
  const parenStack: Array<{ position: number; precedingWord: string | null }> = [];
  let inString = false;
  let prev = 0;
  let wordStart = -1;
  let lastWord: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === CC_SINGLE_QUOTE && prev !== CC_BACKSLASH) {
      inString = !inString;
    }
    if (!inString) {
      if (isIdentifierChar(ch)) {
        if (wordStart < 0) wordStart = i;
      } else {
        if (wordStart >= 0) {
          lastWord = text.slice(wordStart, i);
          wordStart = -1;
        }
        if (ch === CC_OPEN_PAREN) {
          parenStack.push({ position: i, precedingWord: lastWord });
          lastWord = null;
        } else if (ch === CC_CLOSE_PAREN && parenStack.length > 0) {
          parenStack.pop();
        }
      }
    }
    prev = ch;
  }
  if (wordStart >= 0) {
    lastWord = text.slice(wordStart);
  }

  if (parenStack.length > 0) {
    const last = parenStack[parenStack.length - 1];
    if (last.precedingWord) {
      const upper = last.precedingWord.toUpperCase();
      if (KNOWN_SQL_FUNCTIONS.has(upper) || !SUBQUERY_KEYWORDS.has(upper)) {
        return last.precedingWord;
      }
    }
  }
  return null;
}

/** Check if text-before-cursor ends immediately after a comma (whitespace ignored). */
function checkIfAfterComma(text: string): boolean {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text.charCodeAt(i);
    if (isWhitespace(ch)) continue;
    return ch === CC_COMMA;
  }
  return false;
}

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

  let tableReferences = extractTableReferences(currentStatement);
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
