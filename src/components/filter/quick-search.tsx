import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { ColumnInfo } from '../../types/query';

interface QuickSearchProps {
  columns: ColumnInfo[];
  onSearch: (whereClause: string) => void;
  onClear: () => void;
}

function buildLikeClause(term: string, columns: ColumnInfo[]): string {
  if (!term.trim()) return '';
  const escaped = term.replace(/'/g, "''");
  return columns
    .map((col) => `"${col.name}" LIKE '%${escaped}%'`)
    .join(' OR ');
}

export function QuickSearch({ columns, onSearch, onClear }: QuickSearchProps) {
  const [term, setTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback(
    (value: string) => {
      if (!value.trim()) {
        onClear();
        return;
      }
      onSearch(buildLikeClause(value, columns));
    },
    [columns, onSearch, onClear],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setTerm(v);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fire(v), 400);
    },
    [fire],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        fire(term);
      }
    },
    [fire, term],
  );

  const handleClear = useCallback(() => {
    setTerm('');
    onClear();
  }, [onClear]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1">
      <Search size={12} className="flex-shrink-0 text-zinc-400" />
      <input
        type="text"
        value={term}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Quick search across all columns…"
        className="h-6 min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      />
      {term && (
        <button
          onClick={handleClear}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          title="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
