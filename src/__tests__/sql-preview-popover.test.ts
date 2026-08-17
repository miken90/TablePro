import { describe, expect, it } from 'vitest';
import type { RowChange } from '../stores/changeStore';
import { generatePreviewSql } from '../components/grid/sql-preview-popover';

describe('sql preview popover', () => {
  it('uses IS NULL in WHERE predicates for null primary key values', () => {
    const changes: Record<number, RowChange> = {
      0: {
        type: 'update',
        rowIndex: 0,
        cellChanges: [{
          rowIndex: 0,
          columnIndex: 1,
          columnName: 'name',
          oldValue: 'Alice',
          newValue: 'Bob',
        }],
        originalRow: [null, 'Alice'],
      },
    };

    const sql = generatePreviewSql(
      changes,
      'users',
      'public',
      ['id', 'name'],
      ['id'],
      [[null, 'Alice']],
    );

    expect(sql).toContain('WHERE "id" IS NULL');
    expect(sql).not.toContain('"id"=NULL');
  });
});
