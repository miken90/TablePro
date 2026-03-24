import React from 'react';
import { X } from 'lucide-react';
import type { ColumnInfo } from '../../types/query';
import { ALL_OPERATORS, UNARY_OPERATORS } from './filter-types';
import type { FilterCondition, FilterOperator } from './filter-types';

interface FilterRowProps {
  condition: FilterCondition;
  columns: ColumnInfo[];
  onChange: (updated: FilterCondition) => void;
  onRemove: () => void;
  onApply?: () => void;
}

const selectCls =
  'h-6 rounded border border-zinc-300 bg-white px-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200';
const inputCls =
  'h-6 rounded border border-zinc-300 bg-white px-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200';

export function FilterRow({ condition, columns, onChange, onRemove, onApply }: FilterRowProps) {
  const isUnary = UNARY_OPERATORS.includes(condition.operator);

  return (
    <div className="flex items-center gap-1.5">
      {/* Enable checkbox */}
      <input
        type="checkbox"
        checked={condition.enabled}
        onChange={(e) => onChange({ ...condition, enabled: e.target.checked })}
        className="h-3 w-3 accent-blue-500"
      />

      {/* Column select */}
      <select
        value={condition.column}
        onChange={(e) => onChange({ ...condition, column: e.target.value })}
        className={`${selectCls} w-32 min-w-0`}
      >
        <option value="">Column…</option>
        {columns.map((col) => (
          <option key={col.name} value={col.name}>
            {col.name}
          </option>
        ))}
      </select>

      {/* Operator select */}
      <select
        value={condition.operator}
        onChange={(e) =>
          onChange({ ...condition, operator: e.target.value as FilterOperator })
        }
        className={`${selectCls} w-24`}
      >
        {ALL_OPERATORS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>

      {/* Value input (hidden for unary operators) */}
      {!isUnary && (
        <input
          type="text"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onApply?.();
            }
          }}
          placeholder={condition.operator === 'BETWEEN' ? 'a, b' : 'value'}
          className={`${inputCls} w-36 min-w-0 flex-1`}
        />
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
        title="Remove filter"
      >
        <X size={12} />
      </button>
    </div>
  );
}
