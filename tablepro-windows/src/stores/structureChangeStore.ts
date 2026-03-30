import { create } from "zustand";

export interface ColumnDefinition {
  name: string;
  typeName: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  position: number;
}

export type StructureChangeType = "add_column" | "modify_column" | "drop_column";

export interface StructureChange {
  type: StructureChangeType;
  columnName: string;
  before?: ColumnDefinition;
  after?: ColumnDefinition;
}

interface StructureChangeStore {
  changes: StructureChange[];
  addChange: (change: StructureChange) => void;
  dropColumn: (column: ColumnDefinition) => void;
  addColumn: (after: ColumnDefinition) => void;
  modifyColumn: (before: ColumnDefinition, after: ColumnDefinition) => void;
  discardAll: () => void;
}

export const useStructureChangeStore = create<StructureChangeStore>((set, get) => ({
  changes: [],

  addChange(change) {
    set(s => ({ changes: [...s.changes, change] }));
  },

  dropColumn(column) {
    // If there's already an "add_column" for this column, cancel it out
    const existing = get().changes.find(
      c => c.type === "add_column" && c.after?.name === column.name
    );
    if (existing) {
      set(s => ({ changes: s.changes.filter(c => c !== existing) }));
      return;
    }
    // Remove any prior modify for this column and replace with drop
    set(s => ({
      changes: [
        ...s.changes.filter(c => c.columnName !== column.name),
        { type: "drop_column", columnName: column.name, before: column },
      ],
    }));
  },

  addColumn(column) {
    set(s => ({
      changes: [
        ...s.changes,
        { type: "add_column", columnName: column.name, after: column },
      ],
    }));
  },

  modifyColumn(before, after) {
    // If already adding this column (it's new), update its definition instead
    const addIdx = get().changes.findIndex(
      c => c.type === "add_column" && c.columnName === before.name
    );
    if (addIdx >= 0) {
      set(s => {
        const next = [...s.changes];
        next[addIdx] = { type: "add_column", columnName: after.name, after };
        return { changes: next };
      });
      return;
    }
    // Update or add a modify_column change
    set(s => ({
      changes: [
        ...s.changes.filter(c => c.columnName !== before.name || c.type !== "modify_column"),
        { type: "modify_column", columnName: before.name, before, after },
      ],
    }));
  },

  discardAll() {
    set({ changes: [] });
  },
}));
