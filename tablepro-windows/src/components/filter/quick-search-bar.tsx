import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ColumnInfo } from '../../types/query';

interface QuickSearchBarProps {
  columns: ColumnInfo[];
  value: string;
  onSearch: (term: string, whereClause: string) => void;
  onClear: () => void;
}

function isTextColumn(typeName: string): boolean {
  const t = typeName.toLowerCase();
  return (
    t.includes('char')
    || t.includes('text')
    || t.includes('string')
    || t.includes('uuid')
    || t.includes('json')
    || t.includes('xml')
  );
}

function buildQuickSearchWhereClause(term: string, columns: ColumnInfo[]): string {
  const normalized = term.trim();
  if (!normalized) return '';

  const escaped = normalized.replace(/'/g, "''");
  const searchableColumns = columns.filter((c) => isTextColumn(c.typeName));
  if (searchableColumns.length === 0) return '';

  return searchableColumns
    .map((c) => `"${c.name}" LIKE '%${escaped}%'`)
    .join(' OR ');
}

export function QuickSearchBar({ columns, value, onSearch, onClear }: QuickSearchBarProps) {
  const [term, setTerm] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTerm(value);
  }, [value]);

  const emitSearch = useCallback((nextTerm: string) => {
    const clause = buildQuickSearchWhereClause(nextTerm, columns);
    onSearch(nextTerm, clause);
  }, [columns, onSearch]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setTerm(next);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      emitSearch(next);
    }, 300);
  }, [emitSearch]);

  const clearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setTerm('');
    onClear();
  }, [onClear]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSearch();
      return;
    }

    if (event.key === 'Enter') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      emitSearch(term);
    }
  }, [clearSearch, emitSearch, term]);

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  return (
    <div className="ml-2 flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900">
      <Search size={12} className="text-zinc-400" />
      <input
        type="text"
        value={term}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Quick search"
        className="h-5 w-56 bg-transparent text-xs outline-none placeholder:text-zinc-400 dark:text-zinc-200"
      />
      {term && (
        <button
          onClick={clearSearch}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Clear quick search"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
