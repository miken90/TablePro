import { describe, it, expect, beforeEach } from 'vitest';
import { useChangeStore } from '../stores/changeStore';

function resetStore() {
  useChangeStore.setState({ _changes: {}, _undoStack: [], _redoStack: [] });
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
    expect(useChangeStore.getState().getRowChangeType(0)).toBe('update');
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
});
