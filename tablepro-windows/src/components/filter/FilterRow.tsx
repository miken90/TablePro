import { Minus } from "lucide-react";
import { useFilterStore } from "../../stores/filter";
import { FILTER_OPERATORS } from "../../types/filter";
import type { FilterCondition, FilterOperator, LogicalOp } from "../../types/filter";

interface FilterRowProps {
  index: number;
  condition: FilterCondition;
  columns: string[];
  showLogicalOp: boolean;
}

export function FilterRow({ index, condition, columns, showLogicalOp }: FilterRowProps) {
  const updateCondition = useFilterStore((s) => s.updateCondition);
  const removeCondition = useFilterStore((s) => s.removeCondition);

  const operatorInfo = FILTER_OPERATORS.find((o) => o.value === condition.operator);

  return (
    <div className="flex items-center gap-2">
      {showLogicalOp && (
        <select
          value={condition.logical_op}
          onChange={(e) => updateCondition(index, { logical_op: e.target.value as LogicalOp })}
          className="w-16 rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      )}
      {!showLogicalOp && <div className="w-16 text-center text-xs text-zinc-500">Where</div>}

      <select
        value={condition.column}
        onChange={(e) => updateCondition(index, { column: e.target.value })}
        className="w-40 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      >
        <option value="">Select column...</option>
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => updateCondition(index, { operator: e.target.value as FilterOperator })}
        className="w-28 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {FILTER_OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {operatorInfo?.needsValue && (
        <input
          type="text"
          value={condition.value ?? ""}
          onChange={(e) => updateCondition(index, { value: e.target.value || null })}
          placeholder="Value..."
          className="min-w-[120px] flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500"
        />
      )}

      {operatorInfo?.needsValue2 && (
        <>
          <span className="text-xs text-zinc-500">and</span>
          <input
            type="text"
            value={condition.value2 ?? ""}
            onChange={(e) => updateCondition(index, { value2: e.target.value || null })}
            placeholder="Value 2..."
            className="min-w-[120px] flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500"
          />
        </>
      )}

      <button
        onClick={() => removeCondition(index)}
        className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
        title="Remove filter"
      >
        <Minus size={14} />
      </button>
    </div>
  );
}
