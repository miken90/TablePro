import { useEffect, useState, useCallback } from "react";
import { Key, Plus, Trash2 } from "lucide-react";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { ColumnInfo } from "../../types/query";
import { useStructureChangeStore, type ColumnDefinition } from "../../stores/structureChangeStore";
import { TypePicker } from "./type-picker";

interface ColumnsTabProps {
  sessionId: string;
  tableName: string;
  schema?: string;
  driverType?: string;
  /** This table's staged-DDL bucket; read directly so the first frame never shows another table's changes. */
  structureKey: string;
}

/** Stable empty list so an untouched table does not re-render on every store update. */
const NO_CHANGES: never[] = [];

function columnInfoToDef(col: ColumnInfo, position: number): ColumnDefinition {
  return {
    name: col.name,
    typeName: col.typeName,
    nullable: col.nullable,
    defaultValue: null,
    isPrimaryKey: col.isPrimaryKey,
    position,
  };
}

function isDropped(name: string, changes: ReturnType<typeof useStructureChangeStore.getState>['changes']): boolean {
  return changes.some(c => c.type === 'drop_column' && c.columnName === name);
}

function isModified(name: string, changes: ReturnType<typeof useStructureChangeStore.getState>['changes']): boolean {
  return changes.some(c => c.type === 'modify_column' && c.columnName === name);
}

function isAdded(name: string, changes: ReturnType<typeof useStructureChangeStore.getState>['changes']): boolean {
  return changes.some(c => c.type === 'add_column' && c.columnName === name);
}

interface EditableRowProps {
  col: ColumnDefinition;
  idx: number;
  isOriginal: boolean;
  rowState: 'normal' | 'modified' | 'added' | 'dropped';
  onModify: (before: ColumnDefinition, after: ColumnDefinition) => void;
  onDrop: (col: ColumnDefinition) => void;
  onUndrop: (name: string) => void;
}

function EditableRow({ col, idx, isOriginal, rowState, onModify, onDrop, onUndrop }: EditableRowProps) {
  const [editName, setEditName] = useState(col.name);
  const [editType, setEditType] = useState(col.typeName);
  const [editNullable, setEditNullable] = useState(col.nullable);
  const [editDefault, setEditDefault] = useState(col.defaultValue ?? "");

  const isDroppedRow = rowState === 'dropped';
  const isAddedRow = rowState === 'added';

  const commitEdit = useCallback(() => {
    const after: ColumnDefinition = {
      ...col,
      name: editName.trim() || col.name,
      typeName: editType,
      nullable: editNullable,
      defaultValue: editDefault.trim() || null,
    };
    const hasChange =
      after.name !== col.name ||
      after.typeName !== col.typeName ||
      after.nullable !== col.nullable ||
      after.defaultValue !== col.defaultValue;
    if (hasChange) {
      onModify(col, after);
    }
  }, [col, editName, editType, editNullable, editDefault, onModify]);

  const rowBg = isDroppedRow
    ? "bg-grid-row-deleted opacity-60"
    : isAddedRow
    ? "bg-grid-row-inserted"
    : rowState === 'modified'
    ? "bg-grid-row-updated"
    : "hover:bg-grid-row-hover hover:text-text-primary";

  const borderLeft = isDroppedRow
    ? "border-l-2 border-l-accent-red"
    : isAddedRow
    ? "border-l-2 border-l-accent-green"
    : rowState === 'modified'
    ? "border-l-2 border-l-accent-yellow"
    : "";

  return (
    <tr className={`border-b border-border-subtle text-xs ${rowBg} ${borderLeft}`}>
      <td className="px-3 py-1.5 text-text-secondary">{isAddedRow ? "+" : idx + 1}</td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          {col.isPrimaryKey && <Key size={11} className="shrink-0 text-grid-pk-fg" />}
          {isDroppedRow ? (
            <span className="line-through text-text-secondary">{col.name}</span>
          ) : (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitEdit}
              disabled={isOriginal && col.isPrimaryKey}
              className="w-full font-medium text-text-primary bg-transparent border-b border-transparent hover:border-border-subtle focus:border-focus-ring px-0 py-0 disabled:cursor-default"
            />
          )}
        </div>
      </td>
      <td className="px-2 py-1 w-40">
        {isDroppedRow ? (
          <span className="font-mono text-text-secondary line-through">{col.typeName}</span>
        ) : (
          <TypePicker
            value={editType}
            onChange={v => { setEditType(v); setTimeout(commitEdit, 0); }}
            disabled={col.isPrimaryKey && isOriginal}
          />
        )}
      </td>
      <td className="px-2 py-1">
        {isDroppedRow ? null : (
          <input
            type="checkbox"
            checked={editNullable}
            onChange={e => { setEditNullable(e.target.checked); setTimeout(commitEdit, 0); }}
            disabled={col.isPrimaryKey && isOriginal}
            className="accent-accent-blue cursor-pointer disabled:cursor-default"
          />
        )}
      </td>
      <td className="px-2 py-1">
        {isDroppedRow ? null : (
          <input
            value={editDefault}
            onChange={e => setEditDefault(e.target.value)}
            onBlur={commitEdit}
            placeholder="NULL"
            className="w-full font-mono text-ui-xs text-text-secondary bg-transparent border-b border-transparent hover:border-border-subtle focus:border-focus-ring px-0 py-0"
          />
        )}
      </td>
      <td className="px-2 py-1 text-right">
        {isDroppedRow ? (
          <button
            type="button"
            onClick={() => onUndrop(col.name)}
            className="text-ui-2xs text-text-secondary hover:text-text-primary"
          >
            Undo
          </button>
        ) : !col.isPrimaryKey ? (
          <button
            type="button"
            onClick={() => onDrop(col)}
            title="Drop column"
            className="text-text-secondary hover:text-accent-red"
          >
            <Trash2 size={12} />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export function ColumnsTab({ sessionId, tableName, schema, structureKey }: ColumnsTabProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Staged changes are kept per table by the store (the structure view
  // points it at this table), so switching tabs never discards them.
  const changes = useStructureChangeStore((s) => s._byTable[structureKey] ?? NO_CHANGES);
  const modifyColumn = useStructureChangeStore((s) => s.modifyColumn);
  const dropColumn = useStructureChangeStore((s) => s.dropColumn);
  const addColumn = useStructureChangeStore((s) => s.addColumn);

  /* eslint-disable react-hooks/set-state-in-effect -- reset loading state on fetch */
  useEffect(() => {
    setLoading(true);
    setError(null);
    commands
      .fetchColumns(sessionId, tableName, schema)
      .then((cols) => {
        setColumns(cols);
        setLoading(false);
      })
      .catch((err) => {
        setError(extractErrorMessage(err));
        setLoading(false);
      });
  }, [sessionId, tableName, schema]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAddColumn = useCallback(() => {
    const newCol: ColumnDefinition = {
      name: `new_column_${changes.filter(c => c.type === 'add_column').length + 1}`,
      typeName: "VARCHAR(255)",
      nullable: true,
      defaultValue: null,
      isPrimaryKey: false,
      position: columns.length + changes.filter(c => c.type === 'add_column').length,
    };
    addColumn(newCol);
  }, [columns.length, changes, addColumn]);

  const handleUndrop = useCallback((name: string) => {
    // Through the store action: `changes` is derived from the per-table
    // bucket, so a raw setState on it would leave the drop in place.
    useStructureChangeStore.getState().undropColumn(name);
  }, []);

  if (loading) {
    return <div className="p-3 text-xs text-text-secondary">Loading columns…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-state-danger-fg">{error}</div>;
  }

  const addedCols = changes
    .filter(c => c.type === 'add_column' && c.after)
    .map(c => c.after!);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border-subtle bg-surface">
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary w-8">#</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Name</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary w-44">Type</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary w-20">Nullable</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary w-28">Default</th>
            <th className="px-3 py-1.5 w-10" />
          </tr>
        </thead>
        <tbody>
          {columns.map((col, idx) => {
            const colDef = columnInfoToDef(col, idx);
            const modChange = changes.find(c => c.type === 'modify_column' && c.columnName === col.name);
            const displayDef = modChange?.after ?? colDef;
            const rowState = isDropped(col.name, changes)
              ? 'dropped'
              : isModified(col.name, changes)
              ? 'modified'
              : 'normal';
            return (
              <EditableRow
                key={col.name}
                col={displayDef}
                idx={idx}
                isOriginal
                rowState={rowState}
                onModify={modifyColumn}
                onDrop={dropColumn}
                onUndrop={handleUndrop}
              />
            );
          })}
          {addedCols.map((col, idx) => (
            <EditableRow
              key={`new-${col.name}`}
              col={col}
              idx={columns.length + idx}
              isOriginal={false}
              rowState={isAdded(col.name, changes) ? 'added' : 'normal'}
              onModify={modifyColumn}
              onDrop={dropColumn}
              onUndrop={handleUndrop}
            />
          ))}
        </tbody>
      </table>
      {columns.length === 0 && addedCols.length === 0 && (
        <div className="p-3 text-xs text-text-secondary">No columns found</div>
      )}
      <div className="px-3 py-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={handleAddColumn}
          className="flex items-center gap-1 text-xs text-accent-blue hover:text-text-primary"
        >
          <Plus size={13} />
          Add Column
        </button>
      </div>
    </div>
  );
}
