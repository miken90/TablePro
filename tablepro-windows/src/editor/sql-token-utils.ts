/**
 * SQL token scanning utilities — character-level helpers used by the context analyzer.
 */

// ---------------------------------------------------------------------------
// Character code constants (replaces Swift UTF-16 constants)
// ---------------------------------------------------------------------------
export const CC_SINGLE_QUOTE = "'".charCodeAt(0);
export const CC_DOUBLE_QUOTE = '"'.charCodeAt(0);
export const CC_BACKTICK = '`'.charCodeAt(0);
export const CC_BACKSLASH = '\\'.charCodeAt(0);
export const CC_OPEN_PAREN = '('.charCodeAt(0);
export const CC_CLOSE_PAREN = ')'.charCodeAt(0);
export const CC_DOT = '.'.charCodeAt(0);
export const CC_UNDERSCORE = '_'.charCodeAt(0);
export const CC_COMMA = ','.charCodeAt(0);
export const CC_SPACE = ' '.charCodeAt(0);
export const CC_TAB = '\t'.charCodeAt(0);
export const CC_NEWLINE = '\n'.charCodeAt(0);
export const CC_CR = '\r'.charCodeAt(0);
export const CC_SLASH = '/'.charCodeAt(0);
export const CC_STAR = '*'.charCodeAt(0);
export const CC_DASH = '-'.charCodeAt(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isIdentifierChar(ch: number): boolean {
  return (
    (ch >= 0x41 && ch <= 0x5a) || // A-Z
    (ch >= 0x61 && ch <= 0x7a) || // a-z
    (ch >= 0x30 && ch <= 0x39) || // 0-9
    ch === CC_UNDERSCORE
  );
}

export function isWhitespace(ch: number): boolean {
  return ch === CC_SPACE || ch === CC_TAB || ch === CC_NEWLINE || ch === CC_CR;
}

// Combined regex for removing strings and comments in one pass
export const STRINGS_COMMENTS_RE =
  /'[^']*'|"[^"]*"|\/\*[\s\S]*?\*\/|--[^\n]*/g;

/** Check if text-before-cursor is inside a string literal. */
export function isInsideString(text: string): boolean {
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
export function isInsideComment(text: string): boolean {
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
export function removeStringsAndComments(text: string): string {
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
export function extractPrefix(text: string): { prefix: string; start: number; dotPrefix: string | null } {
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
export function calculateNestingLevel(text: string): number {
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
export function extractInnermostSubqueryText(text: string): string {
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

  const SUBQUERY_DETECT_RE = /^\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/i;

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

// SQL functions recognized in detectFunctionContext
const KNOWN_SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'IFNULL',
  'CONCAT', 'SUBSTRING', 'UPPER', 'LOWER', 'NOW', 'DATE',
  'CAST', 'CONVERT', 'ROUND', 'ABS', 'LENGTH', 'TRIM',
  'GROUP_CONCAT', 'DATE_FORMAT', 'YEAR', 'MONTH', 'DAY',
]);

const SUBQUERY_KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'IN', 'EXISTS', 'NOT']);

/**
 * Detect if cursor is inside a function call; return function name or null.
 */
export function detectFunctionContext(text: string): string | null {
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
export function checkIfAfterComma(text: string): boolean {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text.charCodeAt(i);
    if (isWhitespace(ch)) continue;
    return ch === CC_COMMA;
  }
  return false;
}
