import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useFilterStore } from '../../stores/filterStore';
import { FilterChip } from './filter-chip';

interface QuickFilterBarProps {
  tabId: string;
  /** Forwarded ref so GridHeader can focus + prefill this input */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Always-visible quick filter bar that sits above the data grid.
 *
 * Supports smart filter syntax: `column:value`, `column:>value`,
 * `column:!=value`, and plain text for full-text search.
 * Multiple conditions separated by ` AND `.
 *
 * Debounces input at 150ms before updating the store.
 *
 * Listens for `tablepro:filter-column` custom events dispatched by GridHeader
 * to focus and prefill with the column prefix when the user clicks
 * "Filter by column" in the column menu.
 */
export function QuickFilterBar({ tabId, inputRef }: QuickFilterBarProps) {
  const filterQuery = useFilterStore((s) => s.byTab[tabId]?.filterQuery ?? '');
  const parsedConditions = useFilterStore((s) => s.byTab[tabId]?.parsedConditions ?? []);
  const setFilterQuery = useFilterStore((s) => s.setFilterQuery);
  const removeParsedCondition = useFilterStore((s) => s.removeParsedCondition);
  const clearFilters = useFilterStore((s) => s.clearFilters);

  const [localValue, setLocalValue] = useState(filterQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalRef = useRef<HTMLInputElement | null>(null);
  const activeRef = inputRef ?? internalRef;

  // Sync local value if external store changes (e.g. preset applied)
  useEffect(() => {
    setLocalValue(filterQuery);
  }, [filterQuery]);

  const commitQuery = useCallback(
    (value: string) => {
      setFilterQuery(tabId, value);
    },
    [setFilterQuery, tabId],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setLocalValue(next);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        commitQuery(next);
      }, 150);
    },
    [commitQuery],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        commitQuery(localValue);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setLocalValue('');
        clearFilters(tabId);
      }
    },
    [clearFilters, commitQuery, localValue, tabId],
  );

  const handleClearAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalValue('');
    clearFilters(tabId);
  }, [clearFilters, tabId]);

  const handleRemoveChip = useCallback(
    (index: number) => {
      removeParsedCondition(tabId, index);
    },
    [removeParsedCondition, tabId],
  );

  // Listen for column filter trigger from GridHeader
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ column: string }>).detail;
      if (!detail?.column) return;

      const prefix = `${detail.column}:`;
      const next = localValue.trim() ? `${localValue.trim()} AND ${prefix}` : prefix;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLocalValue(next);
      // Focus and move cursor to end
      setTimeout(() => {
        const el = activeRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(next.length, next.length);
        }
      }, 0);
    };

    window.addEventListener('tablepro:filter-column', handler);
    return () => window.removeEventListener('tablepro:filter-column', handler);
  }, [activeRef, localValue]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasConditions = parsedConditions.length > 0;

  return (
    <div className="flex flex-col border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
      {/* Input row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Search size={13} className="flex-shrink-0 text-zinc-400" />
        <input
          ref={activeRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Filter… (e.g. status:active, age:>25)"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-400 dark:text-zinc-200"
          aria-label="Quick filter"
          spellCheck={false}
        />
        {(hasConditions || localValue) && (
          <button
            onClick={handleClearAll}
            className="flex-shrink-0 rounded p-0.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            title="Clear all filters"
            aria-label="Clear all filters"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Chip row — only rendered when there are active conditions */}
      {hasConditions && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
          {parsedConditions.map((cond, i) => (
            <FilterChip
              key={i}
              condition={cond}
              onRemove={() => handleRemoveChip(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
