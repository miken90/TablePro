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
}

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
    ? "bg-red-50 dark:bg-red-900/10 opacity-60"
    : isAddedRow
    ? "bg-green-50 dark:bg-green-900/10"
    : rowState === 'modified'
    ? "bg-yellow-50 dark:bg-yellow-900/10"
    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50";

  const borderLeft = isDroppedRow
    ? "border-l-2 border-l-red-400"
    : isAddedRow
    ? "border-l-2 border-l-green-500"
    : rowState === 'modified'
    ? "border-l-2 border-l-yellow-400"
    : "";

  return (
    <tr className={`border-b border-zinc-100 dark:border-zinc-800 text-xs ${rowBg} ${borderLeft}`}>
      <td className="px-3 py-1.5 text-zinc-400">{isAddedRow ? "+" : idx + 1}</td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          {col.isPrimaryKey && <Key size={11} className="shrink-0 text-amber-500" />}
          {isDroppedRow ? (
            <span className="line-through text-zinc-400">{col.name}</span>
          ) : (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitEdit}
              disabled={isOriginal && col.isPrimaryKey}
              className="w-full font-medium text-zinc-700 dark:text-zinc-200 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-400 px-0 py-0 disabled:cursor-default"
            />
          )}
        </div>
      </td>
      <td className="px-2 py-1 w-40">
        {isDroppedRow ? (
          <span className="font-mono text-zinc-400 line-through">{col.typeName}</span>
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
            className="accent-blue-500 cursor-pointer disabled:cursor-default"
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
            className="w-full font-mono text-[11px] text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-blue-400 px-0 py-0"
          />
        )}
      </td>
      <td className="px-2 py-1 text-right">
        {isDroppedRow ? (
          <button
            type="button"
            onClick={() => onUndrop(col.name)}
            className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Undo
          </button>
        ) : !col.isPrimaryKey ? (
          <button
            type="button"
            onClick={() => onDrop(col)}
            title="Drop column"
            className="text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export function ColumnsTab({ sessionId, tableName, schema }: ColumnsTabProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { changes, modifyColumn, dropColumn, addColumn, discardAll } = useStructureChangeStore();

  // Reset changes on table switch
  useEffect(() => {
    discardAll();
  }, [sessionId, tableName, schema, discardAll]);

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
    useStructureChangeStore.setState(s => ({
      changes: s.changes.filter(c => !(c.type === 'drop_column' && c.columnName === name)),
    }));
  }, []);

  if (loading) {
    return <div className="p-3 text-xs text-zinc-400">Loading columns…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-red-500">{error}</div>;
  }

  const addedCols = changes
    .filter(c => c.type === 'add_column' && c.after)
    .map(c => c.after!);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400 w-8">#</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Name</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400 w-44">Type</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400 w-20">Nullable</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400 w-28">Default</th>
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
        <div className="p-3 text-xs text-zinc-400">No columns found</div>
      )}
      <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleAddColumn}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          <Plus size={13} />
          Add Column
        </button>
      </div>
    </div>
  );
}
