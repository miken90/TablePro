import { create } from "zustand";

export interface CellChange {
  rowIndex: number;
  columnIndex: number;
  columnName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface RowChange {
  type: "insert" | "update" | "delete";
  rowIndex: number;
  cellChanges: CellChange[];
  originalRow: (string | null)[];
}

type ChangesSnapshot = Record<number, RowChange>;

interface ChangeStoreState {
  _changes: ChangesSnapshot;
  _undoStack: ChangesSnapshot[];
  _redoStack: ChangesSnapshot[];

  readonly hasChanges: boolean;

  getChanges(): Map<number, RowChange>;
  getRowChangeType(rowIndex: number): "insert" | "update" | "delete" | null;
  getCellNewValue(rowIndex: number, columnIndex: number): string | null | undefined;

  recordCellChange(change: CellChange): void;
  recordRowInsert(rowIndex: number, defaults: (string | null)[]): void;
  recordRowDelete(rowIndex: number, originalRow: (string | null)[]): void;
  undo(): void;
  redo(): void;
  clear(): void;
}

const MAX_UNDO_DEPTH = 50;

export const useChangeStore = create<ChangeStoreState>((set, get) => ({
  _changes: {},
  _undoStack: [],
  _redoStack: [],

  get hasChanges() {
    return Object.keys(get()._changes).length > 0;
  },

  getChanges() {
    return new Map(
      Object.entries(get()._changes).map(([k, v]) => [Number(k), v])
    );
  },

  getRowChangeType(rowIndex) {
    return get()._changes[rowIndex]?.type ?? null;
  },

  getCellNewValue(rowIndex, columnIndex) {
    const rowChange = get()._changes[rowIndex];
    if (!rowChange) return undefined;
    const cell = rowChange.cellChanges.find((c) => c.columnIndex === columnIndex);
    if (!cell) return undefined;
    return cell.newValue;
  },

  recordCellChange(change) {
    const { _changes, _undoStack } = get();
    const existing = _changes[change.rowIndex];

    // Can't edit deleted rows
    if (existing?.type === "delete") return;

    const snapshot: ChangesSnapshot = { ..._changes };
    const newUndoStack: ChangesSnapshot[] = [..._undoStack, snapshot].slice(-MAX_UNDO_DEPTH);

    if (existing?.type === "insert") {
      const updatedCells = existing.cellChanges.filter(
        (c) => c.columnName !== change.columnName
      );
      updatedCells.push(change);
      set({
        _changes: { ..._changes, [change.rowIndex]: { ...existing, cellChanges: updatedCells } },
        _undoStack: newUndoStack,
        _redoStack: [],
      });
    } else {
      const rowChange: RowChange = existing ?? {
        type: "update",
        rowIndex: change.rowIndex,
        cellChanges: [],
        originalRow: [],
      };
      const updatedCells = rowChange.cellChanges.filter(
        (c) => c.columnName !== change.columnName
      );
      updatedCells.push(change);
      set({
        _changes: {
          ..._changes,
          [change.rowIndex]: { ...rowChange, type: "update", cellChanges: updatedCells },
        },
        _undoStack: newUndoStack,
        _redoStack: [],
      });
    }
  },

  recordRowInsert(rowIndex, defaults) {
    const { _changes, _undoStack } = get();
    const snapshot: ChangesSnapshot = { ..._changes };
    const cellChanges: CellChange[] = defaults.map((val, idx) => ({
      rowIndex,
      columnIndex: idx,
      columnName: String(idx),
      oldValue: null,
      newValue: val,
    }));
    set({
      _changes: {
        ..._changes,
        [rowIndex]: { type: "insert", rowIndex, cellChanges, originalRow: [] },
      },
      _undoStack: [..._undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
      _redoStack: [],
    });
  },

  recordRowDelete(rowIndex, originalRow) {
    const { _changes, _undoStack } = get();
    const existing = _changes[rowIndex];

    if (existing?.type === "insert") {
      const snapshot: ChangesSnapshot = { ..._changes };
      const updated: ChangesSnapshot = { ..._changes };
      delete updated[rowIndex];
      set({
        _changes: updated,
        _undoStack: [..._undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
        _redoStack: [],
      });
      return;
    }

    const snapshot: ChangesSnapshot = { ..._changes };
    set({
      _changes: {
        ..._changes,
        [rowIndex]: { type: "delete", rowIndex, cellChanges: [], originalRow },
      },
      _undoStack: [..._undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
      _redoStack: [],
    });
  },

  undo() {
    const { _changes, _undoStack, _redoStack } = get();
    if (_undoStack.length === 0) return;
    const prev = _undoStack[_undoStack.length - 1];
    set({
      _changes: prev,
      _undoStack: _undoStack.slice(0, -1),
      _redoStack: [..._redoStack, _changes],
    });
  },

  redo() {
    const { _changes, _undoStack, _redoStack } = get();
    if (_redoStack.length === 0) return;
    const next = _redoStack[_redoStack.length - 1];
    set({
      _changes: next,
      _undoStack: [..._undoStack, _changes],
      _redoStack: _redoStack.slice(0, -1),
    });
  },

  clear() {
    set({ _changes: {}, _undoStack: [], _redoStack: [] });
  },
}));
