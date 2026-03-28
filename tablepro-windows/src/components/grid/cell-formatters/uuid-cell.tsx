import React from 'react';

interface UuidCellProps {
  value: string;
}

export function UuidCell({ value }: UuidCellProps) {
  return (
    <span
      className="font-mono text-zinc-500 dark:text-zinc-400 truncate"
      title={value}
    >
      {value}
    </span>
  );
}
