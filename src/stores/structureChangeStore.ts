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

/**
 * One staged-DDL bucket per table, so two structure tabs never share or wipe
 * each other's edits. Keyed by connection (not session): a session id rotates
 * on reconnect, which would orphan the staged changes.
 */
export function makeStructureKey(connectionId: string, schema: string | null | undefined, tableName: string): string {
  return `${connectionId}:${schema ?? ""}:${tableName}`;
}

interface StructureChangeStore {
  /** Staged changes of the active table — derived from `_byTable[_activeKey]`. */
  changes: StructureChange[];
  _byTable: Record<string, StructureChange[]>;
  _activeKey: string | null;
  /** Point the store at a table. Does not discard anything. */
  setActiveTable: (key: string) => void;
  addChange: (change: StructureChange) => void;
  dropColumn: (column: ColumnDefinition) => void;
  addColumn: (after: ColumnDefinition) => void;
  modifyColumn: (before: ColumnDefinition, after: ColumnDefinition) => void;
  /** Take back a staged drop; the column returns to its live definition. */
  undropColumn: (columnName: string) => void;
  /** Discard the active table's staged changes only. */
  discardAll: () => void;
}

function buildState(byTable: Record<string, StructureChange[]>, activeKey: string | null) {
  return {
    _byTable: byTable,
    _activeKey: activeKey,
    changes: activeKey ? (byTable[activeKey] ?? []) : [],
  };
}

export const useStructureChangeStore = create<StructureChangeStore>((set, get) => {
  /** Replace the active table's list; a no-op when no table is active. */
  function update(mutate: (current: StructureChange[]) => StructureChange[]) {
    set((s) => {
      if (!s._activeKey) return s;
      const next = { ...s._byTable, [s._activeKey]: mutate(s._byTable[s._activeKey] ?? []) };
      return buildState(next, s._activeKey);
    });
  }

  return {
    ...buildState({}, null),

    setActiveTable(key) {
      set((s) => buildState(s._byTable, key));
    },

    addChange(change) {
      update((current) => [...current, change]);
    },

    dropColumn(column) {
      // If there's already an "add_column" for this column, cancel it out
      const existing = get().changes.find(
        (c) => c.type === "add_column" && c.after?.name === column.name,
      );
      if (existing) {
        update((current) => current.filter((c) => c !== existing));
        return;
      }
      // Remove any prior modify for this column and replace with drop
      update((current) => [
        ...current.filter((c) => c.columnName !== column.name),
        { type: "drop_column", columnName: column.name, before: column },
      ]);
    },

    addColumn(column) {
      update((current) => [...current, { type: "add_column", columnName: column.name, after: column }]);
    },

    modifyColumn(before, after) {
      // If already adding this column (it's new), update its definition instead
      const addIdx = get().changes.findIndex(
        (c) => c.type === "add_column" && c.columnName === before.name,
      );
      if (addIdx >= 0) {
        update((current) => {
          const next = [...current];
          next[addIdx] = { type: "add_column", columnName: after.name, after };
          return next;
        });
        return;
      }
      // Update or add a modify_column change
      update((current) => [
        ...current.filter((c) => c.columnName !== before.name || c.type !== "modify_column"),
        { type: "modify_column", columnName: before.name, before, after },
      ]);
    },

    undropColumn(columnName) {
      update((current) => current.filter((c) => !(c.type === "drop_column" && c.columnName === columnName)));
    },

    discardAll() {
      update(() => []);
    },
  };
});
