import { X, Rows3 } from 'lucide-react';
import { FieldRow } from './field-row';
import type { ColumnInfo } from '../../types/query';

interface InspectorPanelProps {
  columns: ColumnInfo[];
  row: (string | null)[] | null;
  onClose: () => void;
}

export function InspectorPanel({ columns, row, onClose }: InspectorPanelProps) {
  return (
    <div className="flex h-full flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-700">
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Inspector</span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Close inspector (Ctrl+Shift+I)"
          aria-label="Close inspector"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      {row === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
          <Rows3 size={24} />
          <span className="text-xs">Select a row to inspect</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {columns.map((col, i) => (
            <FieldRow
              key={col.name}
              name={col.name}
              typeName={col.typeName}
              value={row[i] ?? null}
              isPrimaryKey={col.isPrimaryKey}
            />
          ))}
        </div>
      )}

      {/* Footer with column count */}
      {row !== null && (
        <div className="border-t border-zinc-200 px-3 py-1 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          {columns.length} columns
        </div>
      )}
    </div>
  );
}
