import { create } from "zustand";
import { toast } from "sonner";
import * as commands from "../ipc/commands";
import { extractErrorMessage } from "../ipc/error";
import type { SavePayload } from "../ipc/commands";

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
  /** Page where the insert was created (for display visibility). */
  originPage?: number;
}

type ChangesSnapshot = Record<number, RowChange>;

interface TableChangeState {
  changes: ChangesSnapshot;
  undoStack: ChangesSnapshot[];
  redoStack: ChangesSnapshot[];
}

function emptyTableState(): TableChangeState {
  return { changes: {}, undoStack: [], redoStack: [] };
}

// Singleton empty state used by getters to return stable references
// when no active table is selected (prevents infinite re-render loops).
const EMPTY_STATE: TableChangeState = {
  changes: {},
  undoStack: [],
  redoStack: [],
};

interface ChangeStoreState {
  _byTable: Record<string, TableChangeState>;
  _activeTableKey: string | null;

  readonly hasChanges: boolean;

  setActiveTable: (connectionId: string, schema: string | null, tableName: string) => void;
  clearForTable: (tableKey: string) => void;

  getChanges(): Map<number, RowChange>;
  getRowChangeType(rowIndex: number): "insert" | "update" | "delete" | null;
  getCellNewValue(rowIndex: number, columnIndex: number): string | null | undefined;

  recordCellChange(change: CellChange): void;
  recordRowInsert(rowIndex: number, defaults: (string | null)[], columnNames?: string[], originPage?: number): void;
  recordRowDelete(rowIndex: number, originalRow: (string | null)[]): void;
  undo(): void;
  redo(): void;
  clear(): void;
  saveChanges(sessionId: string, payload: SavePayload): Promise<void>;

  // Expose internal state for consumers that read _changes directly
  readonly _changes: ChangesSnapshot;
  readonly _undoStack: ChangesSnapshot[];
  readonly _redoStack: ChangesSnapshot[];
}

const MAX_UNDO_DEPTH = 50;

function getActiveState(state: { _byTable: Record<string, TableChangeState>; _activeTableKey: string | null }): TableChangeState {
  if (!state._activeTableKey) return EMPTY_STATE as TableChangeState;
  return state._byTable[state._activeTableKey] ?? (EMPTY_STATE as TableChangeState);
}

function makeTableKey(connectionId: string, schema: string | null, tableName: string): string {
  return `${connectionId}:${schema ?? ''}:${tableName}`;
}

export const useChangeStore = create<ChangeStoreState>((set, get) => ({
  _byTable: {},
  _activeTableKey: null,

  get _changes() {
    return getActiveState(get()).changes;
  },

  get _undoStack() {
    return getActiveState(get()).undoStack;
  },

  get _redoStack() {
    return getActiveState(get()).redoStack;
  },

  get hasChanges() {
    return Object.keys(getActiveState(get()).changes).length > 0;
  },

  setActiveTable(connectionId, schema, tableName) {
    const key = makeTableKey(connectionId, schema, tableName);
    set((s) => ({
      _activeTableKey: key,
      _byTable: s._byTable[key] ? s._byTable : { ...s._byTable, [key]: emptyTableState() },
    }));
  },

  clearForTable(tableKey) {
    set((s) => {
      const next = { ...s._byTable };
      delete next[tableKey];
      return { _byTable: next };
    });
  },

  getChanges() {
    const active = getActiveState(get());
    return new Map(
      Object.entries(active.changes).map(([k, v]) => [Number(k), v])
    );
  },

  getRowChangeType(rowIndex) {
    return getActiveState(get()).changes[rowIndex]?.type ?? null;
  },

  getCellNewValue(rowIndex, columnIndex) {
    const rowChange = getActiveState(get()).changes[rowIndex];
    if (!rowChange) return undefined;
    const cell = rowChange.cellChanges.find((c) => c.columnIndex === columnIndex);
    if (!cell) return undefined;
    return cell.newValue;
  },

  recordCellChange(change) {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    const existing = active.changes[change.rowIndex];

    if (existing?.type === "delete") return;

    const snapshot = { ...active.changes };
    const newUndoStack = [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH);

    if (existing?.type === "insert") {
      const updatedCells = existing.cellChanges.filter((c) => c.columnName !== change.columnName);
      updatedCells.push(change);
      set({
        _byTable: {
          ..._byTable,
          [_activeTableKey]: {
            changes: { ...active.changes, [change.rowIndex]: { ...existing, cellChanges: updatedCells } },
            undoStack: newUndoStack,
            redoStack: [],
          },
        },
      });
    } else {
      const rowChange: RowChange = existing ?? {
        type: "update", rowIndex: change.rowIndex, cellChanges: [], originalRow: [],
      };
      const updatedCells = rowChange.cellChanges.filter((c) => c.columnName !== change.columnName);
      updatedCells.push(change);
      set({
        _byTable: {
          ..._byTable,
          [_activeTableKey]: {
            changes: { ...active.changes, [change.rowIndex]: { ...rowChange, type: "update", cellChanges: updatedCells } },
            undoStack: newUndoStack,
            redoStack: [],
          },
        },
      });
    }
  },

  recordRowInsert(rowIndex, defaults, columnNames, originPage) {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    const snapshot = { ...active.changes };
    const cellChanges: CellChange[] = defaults.map((val, idx) => ({
      rowIndex, columnIndex: idx, columnName: columnNames?.[idx] ?? String(idx), oldValue: null, newValue: val,
    }));
    set({
      _byTable: {
        ..._byTable,
        [_activeTableKey]: {
          changes: { ...active.changes, [rowIndex]: { type: "insert", rowIndex, cellChanges, originalRow: [], originPage } },
          undoStack: [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
          redoStack: [],
        },
      },
    });
  },

  recordRowDelete(rowIndex, originalRow) {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    const existing = active.changes[rowIndex];

    if (existing?.type === "insert") {
      const snapshot = { ...active.changes };
      const updated = { ...active.changes };
      delete updated[rowIndex];
      set({
        _byTable: {
          ..._byTable,
          [_activeTableKey]: {
            changes: updated,
            undoStack: [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
            redoStack: [],
          },
        },
      });
      return;
    }

    const snapshot = { ...active.changes };
    set({
      _byTable: {
        ..._byTable,
        [_activeTableKey]: {
          changes: { ...active.changes, [rowIndex]: { type: "delete", rowIndex, cellChanges: [], originalRow } },
          undoStack: [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
          redoStack: [],
        },
      },
    });
  },

  undo() {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    if (active.undoStack.length === 0) return;
    const prev = active.undoStack[active.undoStack.length - 1];
    set({
      _byTable: {
        ..._byTable,
        [_activeTableKey]: {
          changes: prev,
          undoStack: active.undoStack.slice(0, -1),
          redoStack: [...active.redoStack, active.changes],
        },
      },
    });
  },

  redo() {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    if (active.redoStack.length === 0) return;
    const next = active.redoStack[active.redoStack.length - 1];
    set({
      _byTable: {
        ..._byTable,
        [_activeTableKey]: {
          changes: next,
          undoStack: [...active.undoStack, active.changes],
          redoStack: active.redoStack.slice(0, -1),
        },
      },
    });
  },

  clear() {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) {
      set({ _byTable: {} });
      return;
    }
    set({
      _byTable: { ..._byTable, [_activeTableKey]: emptyTableState() },
    });
  },

  async saveChanges(sessionId: string, payload: SavePayload) {
    const loadingId = toast.loading("Saving changes...");
    try {
      const result = await commands.saveChanges(sessionId, payload);
      toast.dismiss(loadingId);
      toast.success("Changes saved", {
        description: `${result.rowsAffected} row${result.rowsAffected !== 1 ? "s" : ""} affected`,
      });
    } catch (err) {
      toast.dismiss(loadingId);
      const msg = extractErrorMessage(err);
      toast.error("Save failed", { description: msg, duration: Infinity });
      throw err;
    }
  },
}));
