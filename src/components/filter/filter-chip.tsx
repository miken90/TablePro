import React from 'react';
import { X } from 'lucide-react';
import { formatConditionLabel } from '../../utils/filter-parser';
import type { ParsedFilterCondition } from '../../utils/filter-parser';

interface FilterChipProps {
  condition: ParsedFilterCondition;
  onRemove: () => void;
}

/**
 * Displays a single parsed filter condition as a removable chip.
 */
export function FilterChip({ condition, onRemove }: FilterChipProps) {
  const label = formatConditionLabel(condition);

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400 dark:text-blue-300">
      <span className="max-w-[180px] truncate">{label}</span>
      <button
        onClick={onRemove}
        className="flex-shrink-0 rounded-full p-0.5 hover:bg-blue-500/30 transition-colors"
        aria-label={`Remove filter: ${label}`}
        title={`Remove: ${label}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}
