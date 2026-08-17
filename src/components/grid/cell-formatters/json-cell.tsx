import React from 'react';
import { summarizeJson } from '../../../utils/cell-formatter';

interface JsonCellProps {
  value: string;
}

export function JsonCell({ value }: JsonCellProps) {
  const summary = summarizeJson(value);

  // Safe full representation — no dangerouslySetInnerHTML
  const fullDisplay = (() => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  })();

  return (
    <span
      className="font-mono text-violet-600 dark:text-violet-400 truncate"
      title={fullDisplay}
    >
      {summary}
    </span>
  );
}
