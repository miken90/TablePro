import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Database } from "lucide-react";
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
  const schemas = useSchemaStore((s) => s.schemas);
  const currentSchema = useSchemaStore((s) => s.currentSchema);
  const setCurrentSchema = useSchemaStore((s) => s.setCurrentSchema);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasSchemas = schemas.length > 0;

  const filteredTables = query
    ? tables.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : tables;

  const filteredSchemas = query
    ? schemas.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : schemas;

  // Build a unified item list for keyboard navigation.
  // Schema items come first (when schemas available and no active filter hides them),
  // preceded by an "All schemas" option that clears the current schema filter.
  type Item =
    | { kind: "schema"; schema: string }
    | { kind: "all-schemas" }
    | { kind: "table"; idx: number };

  const items: Item[] = [];

  if (hasSchemas) {
    items.push({ kind: "all-schemas" });
    filteredSchemas.forEach((s) => items.push({ kind: "schema", schema: s }));
  }
  filteredTables.forEach((_, idx) => items.push({ kind: "table", idx }));

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

  const selectItem = useCallback(
    (itemIdx: number) => {
      const item = items[itemIdx];
      if (!item) return;

      if (item.kind === "all-schemas") {
        setCurrentSchema(null);
        onClose();
      } else if (item.kind === "schema") {
        setCurrentSchema(item.schema);
        onClose();
      } else {
        const table = filteredTables[item.idx];
        if (table) {
          onSelectTable(table.name, table.schema);
          onClose();
        }
      }
    },
    [items, filteredTables, setCurrentSchema, onSelectTable, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(cursor);
    }
  };

  // Scroll cursor item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const totalCount = filteredTables.length;

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
            placeholder="Search tables or schemas…"
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
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-400">
              {query ? "No matches" : "No tables available"}
            </div>
          ) : (
            <>
              {/* Schema section */}
              {hasSchemas && (
                <>
                  <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Schemas
                  </div>

                  {/* All schemas option */}
                  {(() => {
                    const itemIdx = 0;
                    const isActive = cursor === itemIdx;
                    return (
                      <div
                        data-idx={itemIdx}
                        onClick={() => selectItem(itemIdx)}
                        onMouseEnter={() => setCursor(itemIdx)}
                        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                          isActive
                            ? "bg-blue-500 text-white"
                            : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <Database
                          size={11}
                          className={isActive ? "text-blue-200" : "text-zinc-400"}
                        />
                        <span className="flex-1 italic">All schemas</span>
                        {currentSchema === null && (
                          <span
                            className={`text-[10px] ${isActive ? "text-blue-200" : "text-zinc-400"}`}
                          >
                            active
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {filteredSchemas.map((schema, si) => {
                    const itemIdx = 1 + si;
                    const isActive = cursor === itemIdx;
                    return (
                      <div
                        key={schema}
                        data-idx={itemIdx}
                        onClick={() => selectItem(itemIdx)}
                        onMouseEnter={() => setCursor(itemIdx)}
                        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                          isActive
                            ? "bg-blue-500 text-white"
                            : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <Database
                          size={11}
                          className={isActive ? "text-blue-200" : "text-indigo-400"}
                        />
                        <span className="flex-1 font-medium">
                          {highlightMatch(schema, query)}
                        </span>
                        {currentSchema === schema && (
                          <span
                            className={`text-[10px] ${isActive ? "text-blue-200" : "text-zinc-400"}`}
                          >
                            active
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {filteredTables.length > 0 && (
                    <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Tables
                    </div>
                  )}
                </>
              )}

              {/* Table items */}
              {filteredTables.map((table, idx) => {
                const itemIdx = hasSchemas ? 1 + filteredSchemas.length + idx : idx;
                const isActive = cursor === itemIdx;
                return (
                  <div
                    key={table.name}
                    data-idx={itemIdx}
                    onClick={() => selectItem(itemIdx)}
                    onMouseEnter={() => setCursor(itemIdx)}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                      isActive
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
                          isActive ? "text-blue-200" : "text-zinc-400"
                        }`}
                      >
                        {table.schema}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
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
          {totalCount > 0 && (
            <span className="ml-auto text-[10px] text-zinc-400">
              {totalCount} table{totalCount !== 1 ? "s" : ""}
              {currentSchema != null && (
                <span className="ml-1 text-indigo-400">· {currentSchema}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
