import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
  onSelectTable: (tableName: string, schema?: string | null) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-200 text-yellow-900 dark:bg-yellow-600/40 dark:text-yellow-200">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function QuickSwitcher({ open, onClose, onSelectTable }: QuickSwitcherProps) {
  const tables = useSchemaStore((s) => s.tables);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? tables.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : tables;

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const select = useCallback(
    (idx: number) => {
      const table = filtered[idx];
      if (table) {
        onSelectTable(table.name, table.schema);
        onClose();
      }
    },
    [filtered, onSelectTable, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(cursor);
    }
  };

  // Scroll cursor item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[90vw] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
          <Search size={14} className="shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tables…"
            className="flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-400">
              {query ? "No tables match" : "No tables available"}
            </div>
          ) : (
            filtered.map((table, idx) => (
              <div
                key={table.name}
                data-idx={idx}
                onClick={() => select(idx)}
                onMouseEnter={() => setCursor(idx)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                  idx === cursor
                    ? "bg-blue-500 text-white"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="flex-1 font-medium">
                  {highlightMatch(table.name, query)}
                </span>
                {table.schema && (
                  <span
                    className={`text-[10px] ${
                      idx === cursor ? "text-blue-200" : "text-zinc-400"
                    }`}
                  >
                    {table.schema}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
          <span className="text-[10px] text-zinc-400">
            <kbd className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-700">↑↓</kbd> navigate
          </span>
          <span className="text-[10px] text-zinc-400">
            <kbd className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-700">↵</kbd> open
          </span>
          <span className="text-[10px] text-zinc-400">
            <kbd className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-700">Esc</kbd> close
          </span>
          {filtered.length > 0 && (
            <span className="ml-auto text-[10px] text-zinc-400">
              {filtered.length} table{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
