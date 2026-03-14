/**
 * Port of SQLStatementScanner.swift — state-machine scanner for splitting SQL
 * by semicolons while respecting strings and comments.
 */

export interface LocatedStatement {
  sql: string;
  offset: number;
}

const SINGLE_QUOTE = "'".charCodeAt(0);
const DOUBLE_QUOTE = '"'.charCodeAt(0);
const BACKTICK = "`".charCodeAt(0);
const SEMICOLON = ";".charCodeAt(0);
const DASH = "-".charCodeAt(0);
const SLASH = "/".charCodeAt(0);
const STAR = "*".charCodeAt(0);
const NEWLINE = "\n".charCodeAt(0);
const BACKSLASH = "\\".charCodeAt(0);

type StatementCallback = (rawSQL: string, offset: number) => boolean;

function scan(sql: string, cursorPosition: number | null, onStatement: StatementCallback): void {
  const length = sql.length;
  if (length === 0) return;

  // Fast path: no semicolons
  if (!sql.includes(";")) {
    onStatement(sql, 0);
    return;
  }

  const safePosition =
    cursorPosition !== null ? Math.min(Math.max(0, cursorPosition), length) : null;

  let currentStart = 0;
  let inString = false;
  let stringCharVal = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;

  while (i < length) {
    const ch = sql.charCodeAt(i);

    if (inLineComment) {
      if (ch === NEWLINE) inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === STAR && i + 1 < length && sql.charCodeAt(i + 1) === SLASH) {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (!inString && ch === DASH && i + 1 < length && sql.charCodeAt(i + 1) === DASH) {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (!inString && ch === SLASH && i + 1 < length && sql.charCodeAt(i + 1) === STAR) {
      inBlockComment = true;
      i += 2;
      continue;
    }

    // Backslash escape inside string
    if (inString && ch === BACKSLASH && i + 1 < length) {
      i += 2;
      continue;
    }

    // String delimiter handling
    if (ch === SINGLE_QUOTE || ch === DOUBLE_QUOTE || ch === BACKTICK) {
      if (!inString) {
        inString = true;
        stringCharVal = ch;
      } else if (ch === stringCharVal) {
        // Doubled quote escape (e.g. '' or "")
        if (i + 1 < length && sql.charCodeAt(i + 1) === stringCharVal) {
          i++;
        } else {
          inString = false;
        }
      }
    }

    if (ch === SEMICOLON && !inString) {
      const stmtEnd = i + 1;

      if (safePosition !== null) {
        if (safePosition >= currentStart && safePosition <= stmtEnd) {
          onStatement(sql.slice(currentStart, stmtEnd), currentStart);
          return;
        }
      } else {
        const shouldContinue = onStatement(sql.slice(currentStart, stmtEnd), currentStart);
        if (!shouldContinue) return;
      }

      currentStart = stmtEnd;
    }

    i++;
  }

  // Remaining text after last semicolon (or whole string if no semicolon hit cursor)
  if (currentStart < length) {
    if (safePosition !== null) {
      // Cursor is past all semicolons — return trailing fragment
      if (safePosition >= currentStart) {
        onStatement(sql.slice(currentStart), currentStart);
      }
    } else {
      onStatement(sql.slice(currentStart), currentStart);
    }
  }
}

function trimStatement(raw: string): string {
  let result = raw.trim();
  if (result.endsWith(";")) {
    result = result.slice(0, -1).trim();
  }
  return result;
}

/** Split SQL into individual statements, trimming whitespace and trailing semicolons. */
export function allStatements(sql: string): string[] {
  const results: string[] = [];
  scan(sql, null, (rawSQL) => {
    const trimmed = trimStatement(rawSQL);
    if (trimmed.length > 0) results.push(trimmed);
    return true;
  });
  return results;
}

/** Return the trimmed statement that contains the cursor position. */
export function statementAtCursor(sql: string, cursorPosition: number): string {
  return trimStatement(locatedStatementAtCursor(sql, cursorPosition).sql);
}

/** Return the raw statement and its byte offset within the original SQL string. */
export function locatedStatementAtCursor(
  sql: string,
  cursorPosition: number,
): LocatedStatement {
  let result: LocatedStatement = { sql: "", offset: 0 };
  scan(sql, cursorPosition, (rawSQL, offset) => {
    result = { sql: rawSQL, offset };
    return false;
  });
  return result;
}
