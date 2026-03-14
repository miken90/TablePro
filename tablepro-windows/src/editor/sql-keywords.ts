/**
 * SQL keyword/function/operator catalog.
 * Port of SQLKeywords.swift.
 */

import { KIND_BASE_PRIORITY, SQLCompletionItem } from './sql-completion-types';

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

export const SQL_KEYWORDS: string[] = [
  // DQL
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS',
  'DISTINCT', 'ALL', 'TOP',
  // Joins
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS',
  'ON', 'USING',
  // Ordering & Grouping
  'ORDER', 'BY', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'GROUP', 'HAVING',
  // Limiting
  'LIMIT', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
  // Set operations
  'UNION', 'INTERSECT', 'EXCEPT', 'MINUS',
  // Subqueries
  'IN', 'EXISTS', 'ANY', 'SOME',
  // DML
  'INSERT', 'INTO', 'VALUES', 'DEFAULT',
  'UPDATE', 'SET',
  'DELETE', 'TRUNCATE',
  // DDL
  'CREATE', 'ALTER', 'DROP', 'RENAME', 'MODIFY',
  'TABLE', 'VIEW', 'INDEX', 'DATABASE', 'SCHEMA',
  'COLUMN', 'CONSTRAINT', 'PRIMARY', 'FOREIGN', 'KEY',
  'REFERENCES', 'UNIQUE', 'CHECK',
  'AUTO_INCREMENT', 'AUTOINCREMENT', 'SERIAL',
  // Data types
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
  'VARCHAR', 'CHAR', 'TEXT', 'BLOB', 'CLOB',
  'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR',
  'BOOLEAN', 'BOOL', 'BIT',
  'JSON', 'JSONB', 'XML',
  'UUID', 'BINARY', 'VARBINARY',
  // Conditionals
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'IF', 'IFNULL', 'NULLIF', 'COALESCE',
  // Comparison
  'BETWEEN', 'LIKE', 'ILIKE', 'SIMILAR', 'REGEXP', 'RLIKE',
  'IS', 'NULL', 'TRUE', 'FALSE', 'UNKNOWN',
  // Transactions
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'TRANSACTION',
  'ISOLATION', 'LEVEL', 'READ', 'COMMITTED', 'REPEATABLE', 'SERIALIZABLE',
  // Window
  'OVER', 'PARTITION', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT ROW',
  // PostgreSQL
  'RETURNING', 'LATERAL', 'CONCURRENTLY', 'CONFLICT', 'EXCLUDED',
  // MySQL
  'STRAIGHT_JOIN',
  // DCL
  'GRANT', 'REVOKE', 'PRIVILEGES', 'USAGE',
  // Utility
  'DEALLOCATE', 'PREPARE', 'EXECUTE',
  // Other
  'WITH', 'RECURSIVE', 'TEMPORARY', 'TEMP',
  'CASCADE', 'RESTRICT', 'NO', 'ACTION',
  'EXPLAIN', 'ANALYZE', 'DESCRIBE', 'SHOW',
];

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export interface SQLFunction {
  name: string;
  signature: string;
  doc: string;
}

export const AGGREGATE_FUNCTIONS: SQLFunction[] = [
  { name: 'COUNT', signature: 'COUNT(expr)', doc: 'Count rows or non-null values' },
  { name: 'SUM', signature: 'SUM(expr)', doc: 'Sum of values' },
  { name: 'AVG', signature: 'AVG(expr)', doc: 'Average of values' },
  { name: 'MIN', signature: 'MIN(expr)', doc: 'Minimum value' },
  { name: 'MAX', signature: 'MAX(expr)', doc: 'Maximum value' },
  { name: 'GROUP_CONCAT', signature: 'GROUP_CONCAT(expr)', doc: 'Concatenate grouped values' },
  { name: 'STRING_AGG', signature: 'STRING_AGG(expr, sep)', doc: 'PostgreSQL string aggregation' },
  { name: 'ARRAY_AGG', signature: 'ARRAY_AGG(expr)', doc: 'Aggregate into array' },
  { name: 'STDDEV', signature: 'STDDEV(expr)', doc: 'Population standard deviation' },
  { name: 'VARIANCE', signature: 'VARIANCE(expr)', doc: 'Population variance' },
  { name: 'BIT_AND', signature: 'BIT_AND(expr)', doc: 'Bitwise AND aggregate' },
  { name: 'BIT_OR', signature: 'BIT_OR(expr)', doc: 'Bitwise OR aggregate' },
  { name: 'JSON_OBJECTAGG', signature: 'JSON_OBJECTAGG(key, value)', doc: 'Aggregate into JSON object' },
  { name: 'JSON_ARRAYAGG', signature: 'JSON_ARRAYAGG(expr)', doc: 'Aggregate into JSON array' },
];

export const DATETIME_FUNCTIONS: SQLFunction[] = [
  { name: 'NOW', signature: 'NOW()', doc: 'Current date and time' },
  { name: 'CURRENT_TIMESTAMP', signature: 'CURRENT_TIMESTAMP', doc: 'Current timestamp' },
  { name: 'CURRENT_DATE', signature: 'CURRENT_DATE', doc: 'Current date' },
  { name: 'CURRENT_TIME', signature: 'CURRENT_TIME', doc: 'Current time' },
  { name: 'CURDATE', signature: 'CURDATE()', doc: 'Current date (MySQL)' },
  { name: 'CURTIME', signature: 'CURTIME()', doc: 'Current time (MySQL)' },
  { name: 'SYSDATE', signature: 'SYSDATE()', doc: 'System date (MySQL)' },
  { name: 'UTC_TIMESTAMP', signature: 'UTC_TIMESTAMP()', doc: 'Current UTC timestamp' },
  { name: 'UTC_DATE', signature: 'UTC_DATE()', doc: 'Current UTC date' },
  { name: 'UTC_TIME', signature: 'UTC_TIME()', doc: 'Current UTC time' },
  { name: 'DATE', signature: 'DATE(expr)', doc: 'Extract date part' },
  { name: 'TIME', signature: 'TIME(expr)', doc: 'Extract time part' },
  { name: 'YEAR', signature: 'YEAR(date)', doc: 'Extract year' },
  { name: 'MONTH', signature: 'MONTH(date)', doc: 'Extract month' },
  { name: 'DAY', signature: 'DAY(date)', doc: 'Extract day' },
  { name: 'HOUR', signature: 'HOUR(time)', doc: 'Extract hour' },
  { name: 'MINUTE', signature: 'MINUTE(time)', doc: 'Extract minute' },
  { name: 'SECOND', signature: 'SECOND(time)', doc: 'Extract second' },
  { name: 'DAYOFWEEK', signature: 'DAYOFWEEK(date)', doc: 'Day of week (1=Sunday)' },
  { name: 'DAYOFMONTH', signature: 'DAYOFMONTH(date)', doc: 'Day of month' },
  { name: 'DAYOFYEAR', signature: 'DAYOFYEAR(date)', doc: 'Day of year' },
  { name: 'WEEK', signature: 'WEEK(date)', doc: 'Week number' },
  { name: 'QUARTER', signature: 'QUARTER(date)', doc: 'Quarter (1-4)' },
  { name: 'DATE_ADD', signature: 'DATE_ADD(date, INTERVAL)', doc: 'Add interval to date' },
  { name: 'DATE_SUB', signature: 'DATE_SUB(date, INTERVAL)', doc: 'Subtract interval from date' },
  { name: 'DATEDIFF', signature: 'DATEDIFF(date1, date2)', doc: 'Difference in days' },
  { name: 'TIMESTAMPDIFF', signature: 'TIMESTAMPDIFF(unit, t1, t2)', doc: 'Difference in specified unit' },
  { name: 'DATE_FORMAT', signature: 'DATE_FORMAT(date, format)', doc: 'Format date' },
  { name: 'STR_TO_DATE', signature: 'STR_TO_DATE(str, format)', doc: 'Parse string to date' },
  { name: 'UNIX_TIMESTAMP', signature: 'UNIX_TIMESTAMP(date)', doc: 'Unix timestamp' },
  { name: 'FROM_UNIXTIME', signature: 'FROM_UNIXTIME(ts)', doc: 'Date from Unix timestamp' },
  { name: 'EXTRACT', signature: 'EXTRACT(field FROM source)', doc: 'Extract date/time field' },
  { name: 'DATE_TRUNC', signature: 'DATE_TRUNC(field, source)', doc: 'Truncate to precision (PostgreSQL)' },
  { name: 'AGE', signature: 'AGE(timestamp1, timestamp2)', doc: 'Interval between timestamps (PostgreSQL)' },
  { name: 'TO_TIMESTAMP', signature: 'TO_TIMESTAMP(str, format)', doc: 'Parse string to timestamp' },
  { name: 'LAST_DAY', signature: 'LAST_DAY(date)', doc: 'Last day of month' },
  { name: 'MAKEDATE', signature: 'MAKEDATE(year, dayofyear)', doc: 'Create date from year and day' },
  { name: 'MAKETIME', signature: 'MAKETIME(hour, minute, second)', doc: 'Create time value' },
];

export const STRING_FUNCTIONS: SQLFunction[] = [
  { name: 'CONCAT', signature: 'CONCAT(str1, str2, ...)', doc: 'Concatenate strings' },
  { name: 'CONCAT_WS', signature: 'CONCAT_WS(sep, str1, ...)', doc: 'Concatenate with separator' },
  { name: 'SUBSTRING', signature: 'SUBSTRING(str, start, len)', doc: 'Extract substring' },
  { name: 'SUBSTR', signature: 'SUBSTR(str, start, len)', doc: 'Extract substring' },
  { name: 'LEFT', signature: 'LEFT(str, len)', doc: 'Left part of string' },
  { name: 'RIGHT', signature: 'RIGHT(str, len)', doc: 'Right part of string' },
  { name: 'LENGTH', signature: 'LENGTH(str)', doc: 'String length in bytes' },
  { name: 'CHAR_LENGTH', signature: 'CHAR_LENGTH(str)', doc: 'String length in characters' },
  { name: 'UPPER', signature: 'UPPER(str)', doc: 'Convert to uppercase' },
  { name: 'LOWER', signature: 'LOWER(str)', doc: 'Convert to lowercase' },
  { name: 'TRIM', signature: 'TRIM(str)', doc: 'Remove leading/trailing spaces' },
  { name: 'LTRIM', signature: 'LTRIM(str)', doc: 'Remove leading spaces' },
  { name: 'RTRIM', signature: 'RTRIM(str)', doc: 'Remove trailing spaces' },
  { name: 'REPLACE', signature: 'REPLACE(str, from, to)', doc: 'Replace occurrences' },
  { name: 'REVERSE', signature: 'REVERSE(str)', doc: 'Reverse string' },
  { name: 'REPEAT', signature: 'REPEAT(str, count)', doc: 'Repeat string' },
  { name: 'LPAD', signature: 'LPAD(str, len, pad)', doc: 'Left pad string' },
  { name: 'RPAD', signature: 'RPAD(str, len, pad)', doc: 'Right pad string' },
  { name: 'INSTR', signature: 'INSTR(str, substr)', doc: 'Position of substring' },
  { name: 'LOCATE', signature: 'LOCATE(substr, str)', doc: 'Position of substring' },
  { name: 'POSITION', signature: 'POSITION(substr IN str)', doc: 'Position of substring' },
  { name: 'FORMAT', signature: 'FORMAT(number, decimals)', doc: 'Format number' },
  { name: 'SPACE', signature: 'SPACE(n)', doc: 'Return n spaces' },
  { name: 'ASCII', signature: 'ASCII(str)', doc: 'ASCII code of first char' },
  { name: 'CHAR', signature: 'CHAR(n)', doc: 'Character from ASCII code' },
  { name: 'MD5', signature: 'MD5(str)', doc: 'MD5 hash' },
  { name: 'SHA1', signature: 'SHA1(str)', doc: 'SHA1 hash' },
  { name: 'SHA2', signature: 'SHA2(str, bits)', doc: 'SHA2 hash' },
  { name: 'REGEXP_REPLACE', signature: 'REGEXP_REPLACE(str, pattern, replacement)', doc: 'Replace using regex' },
  { name: 'REGEXP_SUBSTR', signature: 'REGEXP_SUBSTR(str, pattern)', doc: 'Extract regex match' },
  { name: 'SPLIT_PART', signature: 'SPLIT_PART(str, delimiter, n)', doc: 'Split and return nth part (PostgreSQL)' },
  { name: 'INITCAP', signature: 'INITCAP(str)', doc: 'Capitalize first letter of each word' },
  { name: 'TRANSLATE', signature: 'TRANSLATE(str, from, to)', doc: 'Replace characters' },
];

export const NUMERIC_FUNCTIONS: SQLFunction[] = [
  { name: 'ABS', signature: 'ABS(n)', doc: 'Absolute value' },
  { name: 'ROUND', signature: 'ROUND(n, decimals)', doc: 'Round to decimals' },
  { name: 'FLOOR', signature: 'FLOOR(n)', doc: 'Round down' },
  { name: 'CEIL', signature: 'CEIL(n)', doc: 'Round up' },
  { name: 'CEILING', signature: 'CEILING(n)', doc: 'Round up' },
  { name: 'TRUNCATE', signature: 'TRUNCATE(n, decimals)', doc: 'Truncate to decimals' },
  { name: 'MOD', signature: 'MOD(n, m)', doc: 'Modulo' },
  { name: 'POW', signature: 'POW(x, y)', doc: 'Power' },
  { name: 'POWER', signature: 'POWER(x, y)', doc: 'Power' },
  { name: 'SQRT', signature: 'SQRT(n)', doc: 'Square root' },
  { name: 'EXP', signature: 'EXP(n)', doc: 'e^n' },
  { name: 'LOG', signature: 'LOG(n)', doc: 'Natural logarithm' },
  { name: 'LOG10', signature: 'LOG10(n)', doc: 'Base-10 logarithm' },
  { name: 'LOG2', signature: 'LOG2(n)', doc: 'Base-2 logarithm' },
  { name: 'SIGN', signature: 'SIGN(n)', doc: 'Sign of number (-1, 0, 1)' },
  { name: 'RAND', signature: 'RAND()', doc: 'Random number 0-1' },
  { name: 'GREATEST', signature: 'GREATEST(v1, v2, ...)', doc: 'Greatest value' },
  { name: 'LEAST', signature: 'LEAST(v1, v2, ...)', doc: 'Least value' },
  { name: 'SIN', signature: 'SIN(n)', doc: 'Sine' },
  { name: 'COS', signature: 'COS(n)', doc: 'Cosine' },
  { name: 'TAN', signature: 'TAN(n)', doc: 'Tangent' },
  { name: 'ASIN', signature: 'ASIN(n)', doc: 'Arc sine' },
  { name: 'ACOS', signature: 'ACOS(n)', doc: 'Arc cosine' },
  { name: 'ATAN', signature: 'ATAN(n)', doc: 'Arc tangent' },
  { name: 'DEGREES', signature: 'DEGREES(n)', doc: 'Radians to degrees' },
  { name: 'RADIANS', signature: 'RADIANS(n)', doc: 'Degrees to radians' },
  { name: 'PI', signature: 'PI()', doc: 'Pi constant' },
];

export const NULL_FUNCTIONS: SQLFunction[] = [
  { name: 'COALESCE', signature: 'COALESCE(v1, v2, ...)', doc: 'First non-null value' },
  { name: 'IFNULL', signature: 'IFNULL(expr, alt)', doc: 'Return alt if expr is null' },
  { name: 'NULLIF', signature: 'NULLIF(expr1, expr2)', doc: 'Null if expr1 = expr2' },
  { name: 'NVL', signature: 'NVL(expr, alt)', doc: 'Return alt if expr is null (Oracle)' },
  { name: 'ISNULL', signature: 'ISNULL(expr)', doc: 'Check if null' },
];

export const CONVERSION_FUNCTIONS: SQLFunction[] = [
  { name: 'CAST', signature: 'CAST(expr AS type)', doc: 'Convert to type' },
  { name: 'CONVERT', signature: 'CONVERT(expr, type)', doc: 'Convert to type' },
  { name: 'BINARY', signature: 'BINARY(str)', doc: 'Convert to binary string' },
];

export const WINDOW_FUNCTIONS: SQLFunction[] = [
  { name: 'ROW_NUMBER', signature: 'ROW_NUMBER() OVER(...)', doc: 'Sequential row number' },
  { name: 'RANK', signature: 'RANK() OVER(...)', doc: 'Rank with gaps' },
  { name: 'DENSE_RANK', signature: 'DENSE_RANK() OVER(...)', doc: 'Rank without gaps' },
  { name: 'NTILE', signature: 'NTILE(n) OVER(...)', doc: 'Divide into n groups' },
  { name: 'LAG', signature: 'LAG(expr, offset, default) OVER(...)', doc: 'Previous row value' },
  { name: 'LEAD', signature: 'LEAD(expr, offset, default) OVER(...)', doc: 'Next row value' },
  { name: 'FIRST_VALUE', signature: 'FIRST_VALUE(expr) OVER(...)', doc: 'First value in partition' },
  { name: 'LAST_VALUE', signature: 'LAST_VALUE(expr) OVER(...)', doc: 'Last value in partition' },
  { name: 'NTH_VALUE', signature: 'NTH_VALUE(expr, n) OVER(...)', doc: 'Nth value in partition' },
  { name: 'PERCENT_RANK', signature: 'PERCENT_RANK() OVER(...)', doc: 'Relative rank (0-1)' },
  { name: 'CUME_DIST', signature: 'CUME_DIST() OVER(...)', doc: 'Cumulative distribution' },
];

export const JSON_FUNCTIONS: SQLFunction[] = [
  { name: 'JSON_EXTRACT', signature: 'JSON_EXTRACT(json, path)', doc: 'Extract value from JSON' },
  { name: 'JSON_OBJECT', signature: 'JSON_OBJECT(key, value, ...)', doc: 'Create JSON object' },
  { name: 'JSON_ARRAY', signature: 'JSON_ARRAY(val1, val2, ...)', doc: 'Create JSON array' },
  { name: 'JSON_KEYS', signature: 'JSON_KEYS(json)', doc: 'Get JSON object keys' },
  { name: 'JSON_LENGTH', signature: 'JSON_LENGTH(json)', doc: 'Get JSON length' },
  { name: 'JSON_TYPE', signature: 'JSON_TYPE(json)', doc: 'Get JSON value type' },
  { name: 'JSON_VALID', signature: 'JSON_VALID(json)', doc: 'Check if valid JSON' },
  { name: 'JSON_CONTAINS', signature: 'JSON_CONTAINS(json, val)', doc: 'Check if JSON contains value' },
  { name: 'JSON_SET', signature: 'JSON_SET(json, path, val)', doc: 'Set value in JSON' },
  { name: 'JSON_INSERT', signature: 'JSON_INSERT(json, path, val)', doc: 'Insert into JSON' },
  { name: 'JSON_REPLACE', signature: 'JSON_REPLACE(json, path, val)', doc: 'Replace in JSON' },
  { name: 'JSON_REMOVE', signature: 'JSON_REMOVE(json, path)', doc: 'Remove from JSON' },
  { name: 'JSON_UNQUOTE', signature: 'JSON_UNQUOTE(json)', doc: 'Unquote JSON string' },
  { name: 'JSON_BUILD_OBJECT', signature: 'JSON_BUILD_OBJECT(key, value, ...)', doc: 'Build JSON object (PostgreSQL)' },
  { name: 'JSON_BUILD_ARRAY', signature: 'JSON_BUILD_ARRAY(val1, val2, ...)', doc: 'Build JSON array (PostgreSQL)' },
  { name: 'JSONB_SET', signature: 'JSONB_SET(target, path, new_value)', doc: 'Set value in JSONB (PostgreSQL)' },
  { name: 'JSON_EACH', signature: 'JSON_EACH(json)', doc: 'Expand JSON to key-value pairs (PostgreSQL)' },
  { name: 'ROW_TO_JSON', signature: 'ROW_TO_JSON(record)', doc: 'Convert row to JSON (PostgreSQL)' },
  { name: 'JSON_AGG', signature: 'JSON_AGG(expr)', doc: 'Aggregate to JSON array (PostgreSQL)' },
  { name: 'JSONB_AGG', signature: 'JSONB_AGG(expr)', doc: 'Aggregate to JSONB array (PostgreSQL)' },
];

export const ALL_FUNCTIONS: SQLFunction[] = [
  ...AGGREGATE_FUNCTIONS,
  ...DATETIME_FUNCTIONS,
  ...STRING_FUNCTIONS,
  ...NUMERIC_FUNCTIONS,
  ...NULL_FUNCTIONS,
  ...CONVERSION_FUNCTIONS,
  ...WINDOW_FUNCTIONS,
  ...JSON_FUNCTIONS,
];

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export const SQL_OPERATORS: Array<{ symbol: string; doc: string }> = [
  { symbol: '=', doc: 'Equal to' },
  { symbol: '<>', doc: 'Not equal to' },
  { symbol: '!=', doc: 'Not equal to' },
  { symbol: '<', doc: 'Less than' },
  { symbol: '>', doc: 'Greater than' },
  { symbol: '<=', doc: 'Less than or equal' },
  { symbol: '>=', doc: 'Greater than or equal' },
  { symbol: '<=>', doc: 'Null-safe equal (MySQL)' },
];

// ---------------------------------------------------------------------------
// Keyword docs (subset of common ones)
// ---------------------------------------------------------------------------

const KEYWORD_DOCS: Record<string, string> = {
  SELECT: 'Retrieve data from one or more tables',
  FROM: 'Specify tables to query data from',
  WHERE: 'Filter rows based on conditions',
  JOIN: 'Combine rows from two or more tables',
  'LEFT JOIN': 'Return all rows from left table with matching rows from right',
  'RIGHT JOIN': 'Return all rows from right table with matching rows from left',
  'INNER JOIN': 'Return rows with matches in both tables',
  'FULL JOIN': 'Return all rows when there is a match in either table',
  'CROSS JOIN': 'Return Cartesian product of both tables',
  INSERT: 'Add new rows to a table',
  UPDATE: 'Modify existing rows in a table',
  DELETE: 'Remove rows from a table',
  CREATE: 'Create database objects (tables, views, indexes)',
  ALTER: 'Modify database object structure',
  DROP: 'Remove database objects',
  'GROUP BY': 'Group rows by column values',
  'ORDER BY': 'Sort result set by columns',
  HAVING: 'Filter groups based on conditions',
  LIMIT: 'Restrict number of returned rows',
  OFFSET: 'Skip a number of rows before returning results',
  DISTINCT: 'Return only unique rows',
  UNION: 'Combine results of multiple SELECT statements',
  INTERSECT: 'Return rows common to multiple SELECT statements',
  EXCEPT: 'Return rows from first SELECT not in second',
  AND: 'Combine conditions (all must be true)',
  OR: 'Combine conditions (any must be true)',
  NOT: 'Negate a condition',
  AS: 'Create an alias for a table or column',
  IN: 'Match against a list of values',
  BETWEEN: 'Match values within a range',
  LIKE: 'Pattern matching with wildcards',
  ILIKE: 'Case-insensitive pattern matching (PostgreSQL)',
  'IS NULL': 'Check for null values',
  'IS NOT NULL': 'Check for non-null values',
  EXISTS: 'Check if subquery returns rows',
  'NOT EXISTS': 'Check if subquery returns no rows',
  CASE: 'Conditional expression',
  WHEN: 'Specify condition in CASE expression',
  THEN: 'Specify result for CASE condition',
  ELSE: 'Default result in CASE expression',
  END: 'End CASE expression',
  RETURNING: 'Return affected rows (PostgreSQL)',
  WITH: 'Define common table expressions (CTEs)',
  VALUES: 'Specify row data for INSERT',
  SET: 'Assign values to columns in UPDATE',
  ON: 'Specify join condition',
  USING: 'Specify join columns with matching names',
  ASC: 'Sort in ascending order',
  DESC: 'Sort in descending order',
  NULL: 'Represents a missing or unknown value',
  DEFAULT: 'Use column default value',
  TRUE: 'Boolean true value',
  FALSE: 'Boolean false value',
  'PRIMARY KEY': 'Uniquely identifies each row in a table',
  'FOREIGN KEY': 'References a primary key in another table',
  REFERENCES: 'Define foreign key reference to another table',
  UNIQUE: 'Ensure all values in a column are distinct',
  CHECK: 'Ensure values satisfy a condition',
  CONSTRAINT: 'Define a named table constraint',
  INDEX: 'Create an index for faster lookups',
  CASCADE: 'Propagate action to dependent rows',
  RESTRICT: 'Prevent action if dependent rows exist',
  'IF NOT EXISTS': 'Only execute if object does not already exist',
  'IF EXISTS': 'Only execute if object exists',
  'ON DELETE': 'Action when referenced row is deleted',
  'ON UPDATE': 'Action when referenced row is updated',
  ENGINE: 'Specify storage engine (MySQL)',
  AUTO_INCREMENT: 'Auto-generate sequential values',
  'PARTITION BY': 'Divide window into partitions',
  'NULLS FIRST': 'Sort null values before non-null values',
  'NULLS LAST': 'Sort null values after non-null values',
  'ON CONFLICT': 'Handle unique constraint violations (PostgreSQL)',
  'ON DUPLICATE KEY UPDATE': 'Handle duplicate key on insert (MySQL)',
};

// ---------------------------------------------------------------------------
// Factory helpers (matching Swift factory methods)
// ---------------------------------------------------------------------------

function makeKeyword(kw: string): SQLCompletionItem {
  const upper = kw.toUpperCase();
  return {
    label: upper,
    kind: 'keyword',
    insertText: upper,
    documentation: KEYWORD_DOCS[upper],
    sortPriority: KIND_BASE_PRIORITY.keyword,
    filterText: upper.toLowerCase(),
  };
}

function makeFunction(fn: SQLFunction): SQLCompletionItem {
  return {
    label: fn.name,
    kind: 'function',
    insertText: `${fn.name}()`,
    detail: fn.signature,
    documentation: fn.doc,
    sortPriority: KIND_BASE_PRIORITY.function,
    filterText: fn.name.toLowerCase(),
  };
}

function makeOperator(op: { symbol: string; doc: string }): SQLCompletionItem {
  return {
    label: op.symbol,
    kind: 'operator',
    insertText: op.symbol,
    documentation: op.doc,
    sortPriority: KIND_BASE_PRIORITY.operator,
    filterText: op.symbol.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function keywordItems(): SQLCompletionItem[] {
  return SQL_KEYWORDS.map(makeKeyword);
}

export function functionItems(): SQLCompletionItem[] {
  return ALL_FUNCTIONS.map(makeFunction);
}

export function operatorItems(): SQLCompletionItem[] {
  return SQL_OPERATORS.map(makeOperator);
}

/** Create a keyword item for an arbitrary string (used in provider). */
export function makeKeywordItem(kw: string): SQLCompletionItem {
  return makeKeyword(kw);
}

/** Create a table completion item. */
export function makeTableItem(name: string, isView = false): SQLCompletionItem {
  return {
    label: name,
    kind: isView ? 'view' : 'table',
    insertText: name,
    detail: isView ? 'View' : 'Table',
    sortPriority: isView ? KIND_BASE_PRIORITY.view : KIND_BASE_PRIORITY.table,
    filterText: name.toLowerCase(),
  };
}

/** Create a column completion item. */
export function makeColumnItem(
  name: string,
  typeName: string,
  tableName?: string,
  isPrimaryKey = false,
  nullable = true,
): SQLCompletionItem {
  const detailParts: string[] = [];
  if (isPrimaryKey) detailParts.push('PK');
  if (!nullable) detailParts.push('NOT NULL');
  if (typeName) detailParts.push(typeName);
  const detail = detailParts.length > 0 ? detailParts.join(' · ') : undefined;
  const documentation = tableName ? `Column from ${tableName}` : undefined;

  return {
    label: name,
    kind: 'column',
    insertText: name,
    detail,
    documentation,
    sortPriority: KIND_BASE_PRIORITY.column,
    filterText: name.toLowerCase(),
  };
}
