import { useState } from 'react';
import { Key } from 'lucide-react';

interface FieldRowProps {
  name: string;
  typeName: string;
  value: string | null;
  isPrimaryKey: boolean;
}

function isJsonLike(v: string): boolean {
  const t = v.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

function isBoolType(typeName: string): boolean {
  return typeName.toLowerCase().includes('bool');
}

export function FieldRow({ name, typeName, value, isPrimaryKey }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = value !== null && value.length > 100;
  const isJson = value !== null && isJsonLike(value);
  const isBool = isBoolType(typeName);

  const renderValue = () => {
    if (value === null) {
      return <span className="italic text-zinc-400 dark:text-zinc-500">NULL</span>;
    }
    if (isBool) {
      const checked = value === 'true' || value === '1' || value === 't';
      return (
        <span className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={checked} readOnly className="pointer-events-none h-3 w-3" />
          {value}
        </span>
      );
    }
    if (isJson) {
      const display = isLong && !expanded ? value.slice(0, 100) + '...' : value;
      return (
        <button
          onClick={() => isLong && setExpanded((v) => !v)}
          className={`text-left font-mono text-xs text-zinc-700 dark:text-zinc-300 ${isLong ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : 'cursor-default'}`}
        >
          {display}
        </button>
      );
    }
    if (isLong && !expanded) {
      return (
        <button
          onClick={() => setExpanded(true)}
          className="text-left text-xs text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400"
        >
          {value.slice(0, 100)}
          <span className="text-zinc-400">...</span>
        </button>
      );
    }
    if (isLong && expanded) {
      return (
        <button
          onClick={() => setExpanded(false)}
          className="text-left text-xs text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400 break-all"
        >
          {value}
        </button>
      );
    }
    return <span className="text-xs text-zinc-700 dark:text-zinc-300">{value}</span>;
  };

  return (
    <div className="flex items-start gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
      <div className="flex min-w-0 shrink-0 items-center gap-1" style={{ width: '40%' }}>
        {isPrimaryKey && <Key size={10} className="shrink-0 text-amber-500" />}
        <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-400" title={name}>
          {name}
        </span>
        <span className="shrink-0 rounded bg-zinc-100 px-1 py-px text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
          {typeName}
        </span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden text-xs">{renderValue()}</div>
    </div>
  );
}
