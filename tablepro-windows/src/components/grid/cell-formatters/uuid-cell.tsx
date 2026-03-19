import React from 'react';

interface UuidCellProps {
  value: string;
}

export function UuidCell({ value }: UuidCellProps) {
  const truncated = value.slice(0, 8) + '…';

  return (
    <span
      className="font-mono text-zinc-500 dark:text-zinc-400 truncate"
      title={value}
    >
      {truncated}
    </span>
  );
}
