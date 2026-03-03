import { create } from "zustand";
import type { CellUpdate, RowInsert, TabChanges, UndoRedoEntry } from "../types/changes";

interface ChangeState {
  pendingChanges: Map<string, TabChanges>;
  undoStacks: Map<string, UndoRedoEntry[]>;
  redoStacks: Map<string, UndoRedoEntry[]>;

  recordCellEdit: (
    tabId: string,
    rowIndex: number,
    column: string,
    originalValue: string | null,
    newValue: string | null,
  ) => void;
  recordRowInsert: (tabId: string, values: Record<string, string | null>) => void;
  recordRowDelete: (tabId: string, rowIndex: number) => void;
  undoLastChange: (tabId: string) => void;
  redoChange: (tabId: string) => void;
  discardChanges: (tabId: string) => void;
  getChangeCount: (tabId: string) => number;
  getTabChanges: (tabId: string) => TabChanges | undefined;
}

function getOrCreateTabChanges(map: Map<string, TabChanges>, tabId: string): TabChanges {
  let changes = map.get(tabId);
  if (!changes) {
    changes = { updates: [], inserts: [], deletes: new Set() };
    map.set(tabId, changes);
  }
  return changes;
}

export const useChangeStore = create<ChangeState>((set, get) => ({
  pendingChanges: new Map(),
  undoStacks: new Map(),
  redoStacks: new Map(),

  recordCellEdit: (tabId, rowIndex, column, originalValue, newValue) => {
    set((state) => {
      const pending = new Map(state.pendingChanges);
      const changes = getOrCreateTabChanges(pending, tabId);

      const existing = changes.updates.findIndex(
        (u) => u.rowIndex === rowIndex && u.column === column,
      );
      const update: CellUpdate = { rowIndex, column, originalValue, newValue };

      if (existing >= 0) {
        const orig = changes.updates[existing].originalValue;
        if (orig === newValue) {
          changes.updates.splice(existing, 1);
        } else {
          changes.updates[existing] = { ...update, originalValue: orig };
        }
      } else {
        changes.updates.push(update);
      }

      const undoStacks = new Map(state.undoStacks);
      const stack = undoStacks.get(tabId) ?? [];
      stack.push({ type: "cell_edit", data: update });
      undoStacks.set(tabId, stack);

      const redoStacks = new Map(state.redoStacks);
      redoStacks.set(tabId, []);

      return { pendingChanges: pending, undoStacks, redoStacks };
    });
  },

  recordRowInsert: (tabId, values) => {
    set((state) => {
      const pending = new Map(state.pendingChanges);
      const changes = getOrCreateTabChanges(pending, tabId);
      const insert: RowInsert = { values };
      changes.inserts.push(insert);

      const undoStacks = new Map(state.undoStacks);
      const stack = undoStacks.get(tabId) ?? [];
      stack.push({ type: "row_insert", data: insert });
      undoStacks.set(tabId, stack);

      const redoStacks = new Map(state.redoStacks);
      redoStacks.set(tabId, []);

      return { pendingChanges: pending, undoStacks, redoStacks };
    });
  },

  recordRowDelete: (tabId, rowIndex) => {
    set((state) => {
      const pending = new Map(state.pendingChanges);
      const changes = getOrCreateTabChanges(pending, tabId);
      changes.deletes.add(rowIndex);

      const undoStacks = new Map(state.undoStacks);
      const stack = undoStacks.get(tabId) ?? [];
      stack.push({ type: "row_delete", data: { rowIndex } });
      undoStacks.set(tabId, stack);

      const redoStacks = new Map(state.redoStacks);
      redoStacks.set(tabId, []);

      return { pendingChanges: pending, undoStacks, redoStacks };
    });
  },

  undoLastChange: (tabId) => {
    set((state) => {
      const undoStacks = new Map(state.undoStacks);
      const stack = undoStacks.get(tabId);
      if (!stack || stack.length === 0) return state;

      const entry = stack.pop()!;
      undoStacks.set(tabId, stack);

      const redoStacks = new Map(state.redoStacks);
      const redoStack = redoStacks.get(tabId) ?? [];
      redoStack.push(entry);
      redoStacks.set(tabId, redoStack);

      const pending = new Map(state.pendingChanges);
      const changes = getOrCreateTabChanges(pending, tabId);

      if (entry.type === "cell_edit") {
        const edit = entry.data as CellUpdate;
        const idx = changes.updates.findIndex(
          (u) => u.rowIndex === edit.rowIndex && u.column === edit.column,
        );
        if (idx >= 0) changes.updates.splice(idx, 1);
      } else if (entry.type === "row_insert") {
        changes.inserts.pop();
      } else if (entry.type === "row_delete") {
        const del = entry.data as { rowIndex: number };
        changes.deletes.delete(del.rowIndex);
      }

      return { pendingChanges: pending, undoStacks, redoStacks };
    });
  },

  redoChange: (tabId) => {
    set((state) => {
      const redoStacks = new Map(state.redoStacks);
      const stack = redoStacks.get(tabId);
      if (!stack || stack.length === 0) return state;

      const entry = stack.pop()!;
      redoStacks.set(tabId, stack);

      const undoStacks = new Map(state.undoStacks);
      const undoStack = undoStacks.get(tabId) ?? [];
      undoStack.push(entry);
      undoStacks.set(tabId, undoStack);

      const pending = new Map(state.pendingChanges);
      const changes = getOrCreateTabChanges(pending, tabId);

      if (entry.type === "cell_edit") {
        const edit = entry.data as CellUpdate;
        changes.updates.push(edit);
      } else if (entry.type === "row_insert") {
        changes.inserts.push(entry.data as RowInsert);
      } else if (entry.type === "row_delete") {
        const del = entry.data as { rowIndex: number };
        changes.deletes.add(del.rowIndex);
      }

      return { pendingChanges: pending, undoStacks, redoStacks };
    });
  },

  discardChanges: (tabId) => {
    set((state) => {
      const pending = new Map(state.pendingChanges);
      pending.delete(tabId);
      const undoStacks = new Map(state.undoStacks);
      undoStacks.delete(tabId);
      const redoStacks = new Map(state.redoStacks);
      redoStacks.delete(tabId);
      return { pendingChanges: pending, undoStacks, redoStacks };
    });
  },

  getChangeCount: (tabId) => {
    const changes = get().pendingChanges.get(tabId);
    if (!changes) return 0;
    return changes.updates.length + changes.inserts.length + changes.deletes.size;
  },

  getTabChanges: (tabId) => {
    return get().pendingChanges.get(tabId);
  },
}));
