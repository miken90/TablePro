import React, { useState, useCallback } from 'react';
import { Filter, Plus } from 'lucide-react';
import type { ColumnInfo } from '../../types/query';
import { FilterRow } from './filter-row';
import { buildWhereClause } from './filter-types';
import type { FilterCondition, FilterLogic } from './filter-types';

interface FilterPanelProps {
  columns: ColumnInfo[];
  onApply: (whereClause: string) => void;
  onClear: () => void;
}

let nextId = 1;
function makeCondition(): FilterCondition {
  return { id: String(nextId++), column: '', operator: '=', value: '', enabled: true };
}

export function FilterPanel({ columns, onApply, onClear }: FilterPanelProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>([makeCondition()]);
  const [logic, setLogic] = useState<FilterLogic>('AND');

  const update = useCallback((id: string, updated: FilterCondition) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const remove = useCallback((id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addRow = useCallback(() => {
    setConditions((prev) => [...prev, makeCondition()]);
  }, []);

  const handleApply = useCallback(() => {
    const clause = buildWhereClause(conditions, logic);
    onApply(clause);
  }, [conditions, logic, onApply]);

  const handleClear = useCallback(() => {
    setConditions([makeCondition()]);
    setLogic('AND');
    onClear();
  }, [onClear]);

  return (
    <div className="flex items-start gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
      <Filter size={14} className="mt-1 flex-shrink-0 text-zinc-400" />

      {/* Condition rows */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {conditions.map((c) => (
          <FilterRow
            key={c.id}
            condition={c}
            columns={columns}
            onChange={(updated) => update(c.id, updated)}
            onRemove={() => remove(c.id)}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-shrink-0 items-center gap-1.5 pt-0.5">
        {/* AND/OR toggle */}
        <button
          onClick={() => setLogic((l) => (l === 'AND' ? 'OR' : 'AND'))}
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="Toggle AND/OR logic"
        >
          {logic}
        </button>

        {/* Add */}
        <button
          onClick={addRow}
          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"
          title="Add filter condition"
        >
          <Plus size={12} />
        </button>

        {/* Apply */}
        <button
          onClick={handleApply}
          className="rounded bg-blue-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          Apply
        </button>

        {/* Clear */}
        <button
          onClick={handleClear}
          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
