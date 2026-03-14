import { describe, it, expect } from 'vitest';
import { allStatements, statementAtCursor } from '../editor/statement-scanner';

describe('allStatements', () => {
  it('splits by semicolons', () => {
    const result = allStatements('SELECT 1; SELECT 2;');
    expect(result).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('handles string with semicolons', () => {
    const result = allStatements("SELECT 'a;b'; SELECT 2;");
    expect(result).toEqual(["SELECT 'a;b'", 'SELECT 2']);
  });

  it('handles line comments', () => {
    const result = allStatements('SELECT 1; -- comment\nSELECT 2;');
    expect(result).toHaveLength(2);
  });

  it('handles block comments', () => {
    const result = allStatements('SELECT /* ; */ 1; SELECT 2;');
    expect(result).toEqual(['SELECT /* ; */ 1', 'SELECT 2']);
  });

  it('trims whitespace and trailing semicolons', () => {
    const result = allStatements('  SELECT 1 ;  ');
    expect(result).toEqual(['SELECT 1']);
  });

  it('empty input returns empty array', () => {
    expect(allStatements('')).toEqual([]);
  });

  it('single statement without semicolon', () => {
    expect(allStatements('SELECT 1')).toEqual(['SELECT 1']);
  });

  it('handles double-quoted strings', () => {
    const result = allStatements('SELECT "col;name" FROM t; SELECT 2;');
    expect(result).toHaveLength(2);
  });

  it('handles backtick-quoted identifiers', () => {
    const result = allStatements('SELECT `col;name` FROM t; SELECT 2;');
    expect(result).toHaveLength(2);
  });

  it('handles escaped quotes in strings', () => {
    const result = allStatements("SELECT 'it''s'; SELECT 2;");
    expect(result).toHaveLength(2);
  });
});

describe('statementAtCursor', () => {
  it('returns statement containing cursor', () => {
    const sql = 'SELECT 1; SELECT 2; SELECT 3;';
    expect(statementAtCursor(sql, 12)).toBe('SELECT 2');
  });

  it('cursor at start returns first statement', () => {
    expect(statementAtCursor('SELECT 1; SELECT 2;', 0)).toBe('SELECT 1');
  });

  it('cursor at end returns last statement', () => {
    const sql = 'SELECT 1; SELECT 2';
    expect(statementAtCursor(sql, sql.length)).toBe('SELECT 2');
  });
});
