import React from 'react';
import { relativeTime } from '../../../utils/cell-formatter';

interface DateCellProps {
  value: string;
}

export function DateCell({ value }: DateCellProps) {
  const date = new Date(value);
  const formatted = isNaN(date.getTime()) ? value : date.toLocaleString();
  const relative = relativeTime(value);

  return (
    <span
      className="text-zinc-700 dark:text-zinc-300 truncate"
      title={relative ? `${value} (${relative})` : value}
    >
      {formatted}
    </span>
  );
}
