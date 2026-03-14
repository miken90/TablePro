export type ColumnCategory =
  | 'integer'
  | 'float'
  | 'string'
  | 'date'
  | 'boolean'
  | 'json'
  | 'binary'
  | 'uuid'
  | 'array'
  | 'enum'
  | 'unknown';

export function categorizeColumn(typeName: string): ColumnCategory {
  const u = typeName.toUpperCase();
  // Array check FIRST — PG array types start with '_' or contain 'ARRAY'
  if (u.startsWith('_') || u.includes('ARRAY')) return 'array';
  // Date/time BEFORE integer — 'INTERVAL' contains 'INT'
  if (['DATE', 'TIME', 'TIMESTAMP', 'DATETIME', 'INTERVAL'].some(t => u.includes(t))) return 'date';
  if (['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'SERIAL', 'BIGSERIAL'].some(t => u.includes(t))) return 'integer';
  if (['FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'MONEY'].some(t => u.includes(t))) return 'float';
  if (['BOOL', 'BOOLEAN', 'BIT'].some(t => u === t || u.startsWith(t))) return 'boolean';
  if (u === 'JSON' || u === 'JSONB') return 'json';
  if (u === 'UUID') return 'uuid';
  if (['BYTEA', 'BINARY', 'VARBINARY', 'BLOB'].some(t => u.includes(t))) return 'binary';
  if (u.startsWith('ENUM')) return 'enum';
  return 'string';
}
