export interface ErrorPosition {
  /** 1-based character offset in the SQL string */
  charOffset: number | null;
  /** 1-based line number (MySQL provides this) */
  line: number | null;
}

/** Extract error position from a database error message. Best-effort — returns nulls if no position found. */
export function parseErrorPosition(errorMessage: string): ErrorPosition {
  // PostgreSQL: "at character N"
  const pgMatch = errorMessage.match(/at character (\d+)/i);
  if (pgMatch) {
    return { charOffset: parseInt(pgMatch[1], 10), line: null };
  }

  // MySQL: "at line N"
  const mysqlMatch = errorMessage.match(/at line (\d+)/i);
  if (mysqlMatch) {
    return { charOffset: null, line: parseInt(mysqlMatch[1], 10) };
  }

  return { charOffset: null, line: null };
}

/** Convert a 1-based char offset to a 0-based document offset. PostgreSQL positions are 1-based. */
export function pgCharOffsetToDocOffset(charOffset: number): number {
  return Math.max(0, charOffset - 1);
}
