import { describe, it, expect, beforeEach } from 'vitest';
import { useChangeStore } from '../stores/changeStore';

function resetStore() {
  useChangeStore.setState({ _byTable: {}, _activeTableKey: null });
  useChangeStore.getState().setActiveTable('test-conn', 'public', 'users');
}

describe('changeStore', () => {
  beforeEach(() => resetStore());

  it('starts with no changes', () => {
    const state = useChangeStore.getState();
    expect(state.getChanges().size).toBe(0);
  });

  it('recordCellChange creates update entry', () => {
    const { recordCellChange, getRowChangeType } = useChangeStore.getState();
    recordCellChange({
      rowIndex: 0, columnIndex: 1, columnName: 'name',
      oldValue: 'Alice', newValue: 'Bob',
    });
    expect(getRowChangeType(0)).toBe('update');
  });

  it('recordCellChange captures original row snapshot on first update', () => {
    const snapshot = ['1', 'Alice', 'active'];
    const state = useChangeStore.getState();

    state.recordCellChange({
      rowIndex: 0, columnIndex: 1, columnName: 'name',
      oldValue: 'Alice', newValue: 'Bob',
    }, snapshot);

    const change = useChangeStore.getState().getChanges().get(0);
    expect(change?.originalRow).toEqual(snapshot);
  });

  it('recordCellChange keeps stable original row after later edits', () => {
    const firstSnapshot = ['1', 'Alice', 'active'];
    const secondSnapshot = ['1', 'Bob', 'active'];
    const state = useChangeStore.getState();

    state.recordCellChange({
      rowIndex: 0, columnIndex: 1, columnName: 'name',
      oldValue: 'Alice', newValue: 'Bob',
    }, firstSnapshot);

    state.recordCellChange({
      rowIndex: 0, columnIndex: 2, columnName: 'status',
      oldValue: 'active', newValue: 'inactive',
    }, secondSnapshot);

    const change = useChangeStore.getState().getChanges().get(0);
    expect(change?.originalRow).toEqual(firstSnapshot);
  });

  it('recordCellChange on same cell replaces previous', () => {
    const s = useChangeStore.getState();
    s.recordCellChange({
      rowIndex: 0, columnIndex: 1, columnName: 'name',
      oldValue: 'Alice', newValue: 'Bob',
    });
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 1, columnName: 'name',
      oldValue: 'Alice', newValue: 'Charlie',
    });
    expect(useChangeStore.getState().getCellNewValue(0, 1)).toBe('Charlie');
  });

  it('recordCellChange on deleted row is ignored', () => {
    const s = useChangeStore.getState();
    s.recordRowDelete(0, ['val1', 'val2']);
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 0, columnName: 'col',
      oldValue: 'val1', newValue: 'new',
    });
    expect(useChangeStore.getState().getRowChangeType(0)).toBe('delete');
  });

  it('recordRowInsert creates insert entry', () => {
    useChangeStore.getState().recordRowInsert(99, ['a', 'b']);
    expect(useChangeStore.getState().getRowChangeType(99)).toBe('insert');
  });

  it('recordRowDelete on existing row creates delete', () => {
    useChangeStore.getState().recordRowDelete(5, ['x', 'y']);
    expect(useChangeStore.getState().getRowChangeType(5)).toBe('delete');
  });

  it('recordRowDelete on inserted row removes it entirely', () => {
    useChangeStore.getState().recordRowInsert(10, ['a']);
    useChangeStore.getState().recordRowDelete(10, ['a']);
    expect(useChangeStore.getState().getRowChangeType(10)).toBeNull();
  });

  it('undo restores previous state', () => {
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 0, columnName: 'c',
      oldValue: 'a', newValue: 'b',
    });
    expect(useChangeStore.getState().getChanges().size).toBe(1);
    useChangeStore.getState().undo();
    expect(useChangeStore.getState().getChanges().size).toBe(0);
  });

  it('redo restores undone state', () => {
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 0, columnName: 'c',
      oldValue: 'a', newValue: 'b',
    });
    useChangeStore.getState().undo();
    useChangeStore.getState().redo();
    expect(useChangeStore.getState().getChanges().size).toBe(1);
  });

  it('undo when empty does nothing', () => {
    useChangeStore.getState().undo();
    expect(useChangeStore.getState().getChanges().size).toBe(0);
  });

  it('redo when empty does nothing', () => {
    useChangeStore.getState().redo();
    expect(useChangeStore.getState().getChanges().size).toBe(0);
  });

  it('clear resets everything', () => {
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 0, columnName: 'c',
      oldValue: 'a', newValue: 'b',
    });
    useChangeStore.getState().clear();
    expect(useChangeStore.getState().getChanges().size).toBe(0);
  });

  it('getCellNewValue returns undefined for unmodified row', () => {
    expect(useChangeStore.getState().getCellNewValue(999, 0)).toBeUndefined();
  });

  it('mixed changes: insert + update + delete all tracked correctly', () => {
    const s = useChangeStore.getState();
    // Insert a new row
    s.recordRowInsert(100, ['new1', 'new2']);
    // Update an existing row
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 1, columnName: 'name',
      oldValue: 'Alice', newValue: 'Bob',
    });
    // Delete another existing row
    useChangeStore.getState().recordRowDelete(5, ['x', 'y']);

    const state = useChangeStore.getState();
    expect(state.getRowChangeType(100)).toBe('insert');
    expect(state.getRowChangeType(0)).toBe('update');
    expect(state.getRowChangeType(5)).toBe('delete');
    expect(state.getChanges().size).toBe(3);
  });

  it('hasChanges reflects whether changes exist for the active table', () => {
    expect(useChangeStore.getState().hasChanges).toBe(false);
    useChangeStore.getState().recordCellChange({
      rowIndex: 0, columnIndex: 0, columnName: 'c',
      oldValue: 'a', newValue: 'b',
    });
    expect(useChangeStore.getState().hasChanges).toBe(true);
    useChangeStore.getState().clear();
    expect(useChangeStore.getState().hasChanges).toBe(false);
  });
});
