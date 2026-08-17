import { describe, it, expect } from 'vitest';
import { buildWhereClause, UNARY_OPERATORS } from '../components/filter/filter-types';
import type { FilterCondition } from '../components/filter/filter-types';

function cond(
  overrides: Partial<FilterCondition> = {},
): FilterCondition {
  return {
    id: '1',
    column: 'name',
    operator: '=',
    value: 'Alice',
    enabled: true,
    ...overrides,
  };
}

describe('buildWhereClause', () => {
  it('basic equality: column = value', () => {
    const result = buildWhereClause([cond()], 'AND');
    expect(result).toBe(`"name" = 'Alice'`);
  });

  it('multiple AND conditions', () => {
    const conditions = [
      cond({ id: '1', column: 'name', value: 'Alice' }),
      cond({ id: '2', column: 'age', operator: '>', value: '25' }),
    ];
    const result = buildWhereClause(conditions, 'AND');
    expect(result).toBe(`"name" = 'Alice' AND "age" > '25'`);
  });

  it('multiple OR conditions', () => {
    const conditions = [
      cond({ id: '1', column: 'status', value: 'active' }),
      cond({ id: '2', column: 'status', value: 'pending' }),
    ];
    const result = buildWhereClause(conditions, 'OR');
    expect(result).toBe(`"status" = 'active' OR "status" = 'pending'`);
  });

  it('IS NULL (unary operator, no value)', () => {
    const result = buildWhereClause(
      [cond({ operator: 'IS NULL', value: '' })],
      'AND',
    );
    expect(result).toBe(`"name" IS NULL`);
  });

  it('IS NOT NULL (unary operator)', () => {
    const result = buildWhereClause(
      [cond({ operator: 'IS NOT NULL', value: '' })],
      'AND',
    );
    expect(result).toBe(`"name" IS NOT NULL`);
  });

  it('LIKE operator', () => {
    const result = buildWhereClause(
      [cond({ operator: 'LIKE', value: '%test%' })],
      'AND',
    );
    expect(result).toBe(`"name" LIKE '%test%'`);
  });

  it('BETWEEN with two comma-separated values', () => {
    const result = buildWhereClause(
      [cond({ column: 'age', operator: 'BETWEEN', value: '18, 65' })],
      'AND',
    );
    expect(result).toBe(`"age" BETWEEN '18' AND '65'`);
  });

  it('IN passes value through directly', () => {
    const result = buildWhereClause(
      [cond({ column: 'id', operator: 'IN', value: "'a','b','c'" })],
      'AND',
    );
    expect(result).toBe(`"id" IN ('a','b','c')`);
  });

  it('disabled conditions are excluded', () => {
    const conditions = [
      cond({ id: '1', enabled: false }),
      cond({ id: '2', column: 'age', operator: '>', value: '18' }),
    ];
    const result = buildWhereClause(conditions, 'AND');
    expect(result).toBe(`"age" > '18'`);
  });

  it('conditions with empty column are excluded', () => {
    const conditions = [
      cond({ id: '1', column: '' }),
      cond({ id: '2', column: 'age', operator: '>', value: '18' }),
    ];
    const result = buildWhereClause(conditions, 'AND');
    expect(result).toBe(`"age" > '18'`);
  });

  it('all conditions disabled returns empty string', () => {
    const result = buildWhereClause(
      [cond({ enabled: false }), cond({ id: '2', enabled: false })],
      'AND',
    );
    expect(result).toBe('');
  });

  it('single-quote in value is escaped', () => {
    const result = buildWhereClause(
      [cond({ value: "O'Brien" })],
      'AND',
    );
    expect(result).toBe(`"name" = 'O''Brien'`);
  });

  it('BETWEEN with single-quote escaping', () => {
    const result = buildWhereClause(
      [cond({ column: 'label', operator: 'BETWEEN', value: "a'b, c'd" })],
      'AND',
    );
    expect(result).toBe(`"label" BETWEEN 'a''b' AND 'c''d'`);
  });

  it('empty conditions array returns empty string', () => {
    expect(buildWhereClause([], 'AND')).toBe('');
  });

  it('UNARY_OPERATORS constant contains IS NULL and IS NOT NULL', () => {
    expect(UNARY_OPERATORS).toContain('IS NULL');
    expect(UNARY_OPERATORS).toContain('IS NOT NULL');
    expect(UNARY_OPERATORS).toHaveLength(2);
  });
});
