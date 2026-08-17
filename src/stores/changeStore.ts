import { create } from "zustand";
import * as commands from "../ipc/commands";
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

  recordCellChange(change: CellChange, originalRowSnapshot?: (string | null)[]): void;
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
  if (!state._activeTableKey) return EMPTY_STATE;
  return state._byTable[state._activeTableKey] ?? EMPTY_STATE;
}

function makeTableKey(connectionId: string, schema: string | null, tableName: string): string {
  return `${connectionId}:${schema ?? ''}:${tableName}`;
}

function getDerivedState(
  byTable: Record<string, TableChangeState>,
  activeTableKey: string | null,
): Pick<ChangeStoreState, '_changes' | '_undoStack' | '_redoStack' | 'hasChanges'> {
  const active = getActiveState({ _byTable: byTable, _activeTableKey: activeTableKey });
  return {
    _changes: active.changes,
    _undoStack: active.undoStack,
    _redoStack: active.redoStack,
    hasChanges: Object.keys(active.changes).length > 0,
  };
}

function buildState(
  byTable: Record<string, TableChangeState>,
  activeTableKey: string | null,
): Pick<ChangeStoreState, '_byTable' | '_activeTableKey' | '_changes' | '_undoStack' | '_redoStack' | 'hasChanges'> {
  return {
    _byTable: byTable,
    _activeTableKey: activeTableKey,
    ...getDerivedState(byTable, activeTableKey),
  };
}

export const useChangeStore = create<ChangeStoreState>((set, get) => ({
  ...buildState({}, null),

  setActiveTable(connectionId, schema, tableName) {
    const key = makeTableKey(connectionId, schema, tableName);
    set((s) => {
      const byTable = s._byTable[key] ? s._byTable : { ...s._byTable, [key]: emptyTableState() };
      return buildState(byTable, key);
    });
  },

  clearForTable(tableKey) {
    set((s) => {
      const next = { ...s._byTable };
      delete next[tableKey];
      const activeTableKey = s._activeTableKey === tableKey ? null : s._activeTableKey;
      return buildState(next, activeTableKey);
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

  recordCellChange(change, originalRowSnapshot) {
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
      const byTable = {
        ..._byTable,
        [_activeTableKey]: {
          changes: { ...active.changes, [change.rowIndex]: { ...existing, cellChanges: updatedCells } },
          undoStack: newUndoStack,
          redoStack: [],
        },
      };
      set(buildState(byTable, _activeTableKey));
    } else {
      const rowChange: RowChange = existing ?? {
        type: "update",
        rowIndex: change.rowIndex,
        cellChanges: [],
        originalRow: originalRowSnapshot ? [...originalRowSnapshot] : [],
      };
      const updatedCells = rowChange.cellChanges.filter((c) => c.columnName !== change.columnName);
      updatedCells.push(change);
      const nextRowChange: RowChange = { ...rowChange, type: "update", cellChanges: updatedCells };
      const byTable: Record<string, TableChangeState> = {
        ..._byTable,
        [_activeTableKey]: {
          changes: { ...active.changes, [change.rowIndex]: nextRowChange },
          undoStack: newUndoStack,
          redoStack: [],
        },
      };
      set(buildState(byTable, _activeTableKey));
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
    const nextRowChange: RowChange = { type: "insert", rowIndex, cellChanges, originalRow: [], originPage };
    const byTable: Record<string, TableChangeState> = {
      ..._byTable,
      [_activeTableKey]: {
        changes: { ...active.changes, [rowIndex]: nextRowChange },
        undoStack: [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
        redoStack: [],
      },
    };
    set(buildState(byTable, _activeTableKey));
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
      const byTable = {
        ..._byTable,
        [_activeTableKey]: {
          changes: updated,
          undoStack: [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
          redoStack: [],
        },
      };
      set(buildState(byTable, _activeTableKey));
      return;
    }

    const snapshot = { ...active.changes };
    const nextRowChange: RowChange = { type: "delete", rowIndex, cellChanges: [], originalRow };
    const byTable: Record<string, TableChangeState> = {
      ..._byTable,
      [_activeTableKey]: {
        changes: { ...active.changes, [rowIndex]: nextRowChange },
        undoStack: [...active.undoStack, snapshot].slice(-MAX_UNDO_DEPTH),
        redoStack: [],
      },
    };
    set(buildState(byTable, _activeTableKey));
  },

  undo() {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    if (active.undoStack.length === 0) return;
    const prev = active.undoStack[active.undoStack.length - 1];
    const byTable = {
      ..._byTable,
      [_activeTableKey]: {
        changes: prev,
        undoStack: active.undoStack.slice(0, -1),
        redoStack: [...active.redoStack, active.changes],
      },
    };
    set(buildState(byTable, _activeTableKey));
  },

  redo() {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) return;
    const active = _byTable[_activeTableKey] ?? emptyTableState();
    if (active.redoStack.length === 0) return;
    const next = active.redoStack[active.redoStack.length - 1];
    const byTable = {
      ..._byTable,
      [_activeTableKey]: {
        changes: next,
        undoStack: [...active.undoStack, active.changes],
        redoStack: active.redoStack.slice(0, -1),
      },
    };
    set(buildState(byTable, _activeTableKey));
  },

  clear() {
    const { _byTable, _activeTableKey } = get();
    if (!_activeTableKey) {
      set(buildState({}, null));
      return;
    }
    const byTable = { ..._byTable, [_activeTableKey]: emptyTableState() };
    set(buildState(byTable, _activeTableKey));
  },

  async saveChanges(sessionId: string, payload: SavePayload) {
    await commands.saveChanges(sessionId, payload);
  },
}));
