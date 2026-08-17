import { describe, it, expect } from 'vitest';
import { categorizeColumn } from '../types/column-type';

describe('categorizeColumn', () => {
  it('INTEGER → integer', () => expect(categorizeColumn('INTEGER')).toBe('integer'));
  it('BIGINT → integer', () => expect(categorizeColumn('BIGINT')).toBe('integer'));
  it('SMALLINT → integer', () => expect(categorizeColumn('SMALLINT')).toBe('integer'));
  it('SERIAL → integer', () => expect(categorizeColumn('SERIAL')).toBe('integer'));
  it('BIGSERIAL → integer', () => expect(categorizeColumn('BIGSERIAL')).toBe('integer'));

  it('FLOAT → float', () => expect(categorizeColumn('FLOAT')).toBe('float'));
  it('DOUBLE → float', () => expect(categorizeColumn('DOUBLE')).toBe('float'));
  it('DECIMAL(10,2) → float', () => expect(categorizeColumn('DECIMAL(10,2)')).toBe('float'));
  it('NUMERIC → float', () => expect(categorizeColumn('NUMERIC')).toBe('float'));
  it('MONEY → float', () => expect(categorizeColumn('MONEY')).toBe('float'));

  it('BOOLEAN → boolean', () => expect(categorizeColumn('BOOLEAN')).toBe('boolean'));
  it('BOOL → boolean', () => expect(categorizeColumn('BOOL')).toBe('boolean'));
  it('BIT → boolean', () => expect(categorizeColumn('BIT')).toBe('boolean'));

  it('TIMESTAMP → date', () => expect(categorizeColumn('TIMESTAMP')).toBe('date'));
  it('DATETIME → date', () => expect(categorizeColumn('DATETIME')).toBe('date'));
  it('DATE → date', () => expect(categorizeColumn('DATE')).toBe('date'));
  it('INTERVAL → date', () => expect(categorizeColumn('INTERVAL')).toBe('date'));

  it('JSON → json', () => expect(categorizeColumn('JSON')).toBe('json'));
  it('JSONB → json', () => expect(categorizeColumn('JSONB')).toBe('json'));

  it('UUID → uuid', () => expect(categorizeColumn('UUID')).toBe('uuid'));

  it('BYTEA → binary', () => expect(categorizeColumn('BYTEA')).toBe('binary'));
  it('VARBINARY → binary', () => expect(categorizeColumn('VARBINARY')).toBe('binary'));
  it('BLOB → binary', () => expect(categorizeColumn('BLOB')).toBe('binary'));

  it('_int4 → array', () => expect(categorizeColumn('_int4')).toBe('array'));
  it('INTEGER ARRAY → array', () => expect(categorizeColumn('INTEGER ARRAY')).toBe('array'));

  it('ENUM(a,b) → enum', () => expect(categorizeColumn('ENUM(a,b)')).toBe('enum'));

  it('VARCHAR(255) → string', () => expect(categorizeColumn('VARCHAR(255)')).toBe('string'));
  it('TEXT → string', () => expect(categorizeColumn('TEXT')).toBe('string'));
  it('CHAR(10) → string', () => expect(categorizeColumn('CHAR(10)')).toBe('string'));

  it('is case insensitive', () => expect(categorizeColumn('integer')).toBe('integer'));
  it('unknown type defaults to string', () => expect(categorizeColumn('GEOMETRY')).toBe('string'));
});
