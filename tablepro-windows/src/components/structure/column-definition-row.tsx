import { Trash2 } from 'lucide-react';
import type { CreateTableColumnDefinition } from '../../ipc/commands';

interface ColumnDefinitionRowProps {
  index: number;
  column: CreateTableColumnDefinition;
  typeOptions: string[];
  onChange: (index: number, next: CreateTableColumnDefinition) => void;
  onRemove: (index: number) => void;
}

const inputClassName =
  'w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200';

export function ColumnDefinitionRow({
  index,
  column,
  typeOptions,
  onChange,
  onRemove,
}: ColumnDefinitionRowProps) {
  const update = (patch: Partial<CreateTableColumnDefinition>) => {
    onChange(index, { ...column, ...patch });
  };

  return (
    <div className="grid grid-cols-[1.3fr_1fr_auto_1fr_auto_auto] items-center gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/70">
      <input
        value={column.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="column_name"
        className={inputClassName}
      />

      <select
        value={column.dataType}
        onChange={(e) => update({ dataType: e.target.value })}
        className={inputClassName}
      >
        {typeOptions.map((typeName) => (
          <option key={typeName} value={typeName}>
            {typeName}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={column.nullable}
          onChange={(e) => update({ nullable: e.target.checked })}
          className="rounded"
        />
        Nullable
      </label>

      <input
        value={column.defaultValue ?? ''}
        onChange={(e) => update({ defaultValue: e.target.value })}
        placeholder="default"
        className={inputClassName}
      />

      <label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={column.primaryKey}
          onChange={(e) => update({ primaryKey: e.target.checked })}
          className="rounded"
        />
        PK
      </label>

      <button
        onClick={() => onRemove(index)}
        className="rounded p-1 text-zinc-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        title="Remove column"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
