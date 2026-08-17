import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, X, Database, Table2, Layers, Clock, Terminal } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useHistoryStore, type HistoryEntry } from "../../stores/history";

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
  onSelectTable: (tableName: string, schema?: string | null) => void;
}

// --- Result types ---

type ResultKind = 'table' | 'view' | 'collection' | 'database' | 'schema' | 'query';

interface SwitcherResult {
  id: string;
  label: string;
  subtitle?: string;
  kind: ResultKind;
  score: number;
  /** For table/view/collection results */
  schema?: string | null;
  /** For query results */
  historyEntry?: HistoryEntry;
}

interface ResultGroup {
  kind: ResultKind;
  label: string;
  icon: React.ReactNode;
  items: SwitcherResult[];
}

// --- Scoring ---

function scoreMatch(text: string, query: string): number {
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase();
  if (tLower === qLower) return 100; // exact
  if (tLower.startsWith(qLower)) return 80; // prefix
  if (tLower.includes(qLower)) return 60; // substring
  // Simple fuzzy: all query chars appear in order
  let ti = 0;
  for (let qi = 0; qi < qLower.length; qi++) {
    const found = tLower.indexOf(qLower[qi], ti);
    if (found === -1) return 0;
    ti = found + 1;
  }
  return 30; // fuzzy
}

// --- Kind metadata ---

const KIND_ORDER: ResultKind[] = ['table', 'view', 'collection', 'database', 'schema', 'query'];
const KIND_LABELS: Record<ResultKind, string> = {
  table: 'Tables',
  view: 'Views',
  collection: 'Collections',
  database: 'Databases',
  schema: 'Schemas',
  query: 'Recent Queries',
};

function kindIcon(kind: ResultKind, active: boolean): React.ReactNode {
  const cls = active ? "text-blue-200" : "text-zinc-400";
  const size = 11;
  switch (kind) {
    case 'table': return <Table2 size={size} className={cls} />;
    case 'view': return <Layers size={size} className={cls} />;
    case 'collection': return <Database size={size} className={cls} />;
    case 'database': return <Database size={size} className={cls} />;
    case 'schema': return <Layers size={size} className={cls} />;
    case 'query': return <Clock size={size} className={cls} />;
  }
}

function groupIcon(kind: ResultKind): React.ReactNode {
  const cls = "text-zinc-400 dark:text-zinc-500";
  const size = 11;
  switch (kind) {
    case 'table': return <Table2 size={size} className={cls} />;
    case 'view': return <Layers size={size} className={cls} />;
    case 'collection': return <Terminal size={size} className={cls} />;
    case 'database': return <Database size={size} className={cls} />;
    case 'schema': return <Layers size={size} className={cls} />;
    case 'query': return <Clock size={size} className={cls} />;
  }
}

// --- Highlight ---

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

// --- Truncate query text for display ---

function truncateQuery(sql: string, maxLen = 80): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + '...' : oneLine;
}

// --- Component ---

export function QuickSwitcher({ open, onClose, onSelectTable }: QuickSwitcherProps) {
  const tables = useSchemaStore((s) => s.tables);
  const schemas = useSchemaStore((s) => s.schemas);
  const databases = useSchemaStore((s) => s.databases);
  const currentSchema = useSchemaStore((s) => s.currentSchema);
  const setCurrentSchema = useSchemaStore((s) => s.setCurrentSchema);
  const capabilities = useSchemaStore((s) => s.capabilities);
  const historyEntries = useHistoryStore((s) => s.entries);
  const fetchRecentHistory = useHistoryStore((s) => s.fetchRecent);

  const isDocumentDb = capabilities.supportsCollections && !capabilities.supportsSqlEditor;

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch recent history when opening
  /* eslint-disable react-hooks/set-state-in-effect -- reset state on open */
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
      void fetchRecentHistory();
    }
  }, [open, fetchRecentHistory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset cursor on query change
  /* eslint-disable react-hooks/set-state-in-effect -- reset cursor on query change */
  useEffect(() => {
    setCursor(0);
  }, [query]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Build grouped results
  const groups: ResultGroup[] = useMemo(() => {
    const results: SwitcherResult[] = [];
    const q = query.trim();

    // Tables/Views/Collections
    for (const t of tables) {
      const kind: ResultKind = isDocumentDb
        ? 'collection'
        : (t.tableType?.toLowerCase() === 'view' ? 'view' : 'table');
      const score = q ? scoreMatch(t.name, q) : 50;
      if (q && score === 0) continue;
      results.push({
        id: `table:${t.name}:${t.schema ?? ''}`,
        label: t.name,
        subtitle: t.schema ?? undefined,
        kind,
        score,
        schema: t.schema,
      });
    }

    // Databases
    for (const db of databases) {
      const score = q ? scoreMatch(db, q) : 50;
      if (q && score === 0) continue;
      results.push({
        id: `db:${db}`,
        label: db,
        kind: 'database',
        score,
      });
    }

    // Schemas
    for (const s of schemas) {
      const score = q ? scoreMatch(s, q) : 50;
      if (q && score === 0) continue;
      results.push({
        id: `schema:${s}`,
        label: s,
        subtitle: currentSchema === s ? 'active' : undefined,
        kind: 'schema',
        score,
      });
    }

    // Recent queries (limit to 20)
    const recentQueries = historyEntries.slice(0, 20);
    for (const entry of recentQueries) {
      const preview = truncateQuery(entry.query);
      const score = q ? scoreMatch(preview, q) : 40;
      if (q && score === 0) continue;
      results.push({
        id: `query:${entry.id}`,
        label: preview,
        subtitle: entry.database ?? undefined,
        kind: 'query',
        score,
        historyEntry: entry,
      });
    }

    // Sort within each kind by score desc, then label asc
    const grouped = new Map<ResultKind, SwitcherResult[]>();
    for (const r of results) {
      const arr = grouped.get(r.kind) ?? [];
      arr.push(r);
      grouped.set(r.kind, arr);
    }

    const output: ResultGroup[] = [];
    for (const kind of KIND_ORDER) {
      const items = grouped.get(kind);
      if (!items || items.length === 0) continue;
      items.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.label.localeCompare(b.label);
      });
      output.push({
        kind,
        label: KIND_LABELS[kind],
        icon: groupIcon(kind),
        items,
      });
    }

    return output;
  }, [tables, schemas, databases, historyEntries, isDocumentDb, currentSchema, query]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    return groups.flatMap((g) => g.items);
  }, [groups]);

  const selectItem = useCallback(
    (idx: number) => {
      const item = flatItems[idx];
      if (!item) return;

      switch (item.kind) {
        case 'table':
        case 'view':
        case 'collection':
          onSelectTable(item.label, item.schema);
          onClose();
          break;
        case 'database':
          // Switch database — we can't call selectDatabase without sessionId,
          // so for now just close and let the user select from sidebar
          onClose();
          break;
        case 'schema':
          setCurrentSchema(item.label === currentSchema ? null : item.label);
          onClose();
          break;
        case 'query':
          if (item.historyEntry) {
            // Open the query in a new tab by dispatching a custom event
            window.dispatchEvent(
              new CustomEvent('tablepro:open-query-from-history', {
                detail: { query: item.historyEntry.query },
              }),
            );
          }
          onClose();
          break;
      }
    },
    [flatItems, onSelectTable, onClose, setCurrentSchema, currentSchema],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flatItems.length - 1));
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

  const totalCount = flatItems.length;
  const placeholder = isDocumentDb
    ? "Search collections, databases, queries..."
    : "Search tables, schemas, databases, queries...";

  // Compute flat index offset for each group
  let flatOffset = 0;

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
            placeholder={placeholder}
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
          {totalCount === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-400">
              {query ? "No matches" : "No items available"}
            </div>
          ) : (
            groups.map((group) => {
              const groupStart = flatOffset;
              flatOffset += group.items.length;
              return (
                <div key={group.kind}>
                  {/* Section header */}
                  <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {group.icon}
                    {group.label}
                    <span className="ml-auto font-normal tabular-nums">{group.items.length}</span>
                  </div>

                  {/* Items */}
                  {group.items.map((item, i) => {
                    const flatIdx = groupStart + i;
                    const isActive = cursor === flatIdx;
                    return (
                      <div
                        key={item.id}
                        data-idx={flatIdx}
                        onClick={() => selectItem(flatIdx)}
                        onMouseEnter={() => setCursor(flatIdx)}
                        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs ${
                          isActive
                            ? "bg-blue-500 text-white"
                            : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {kindIcon(item.kind, isActive)}
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {highlightMatch(item.label, query)}
                        </span>
                        {item.subtitle && (
                          <span
                            className={`shrink-0 text-[10px] ${
                              isActive ? "text-blue-200" : "text-zinc-400"
                            }`}
                          >
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
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
              {totalCount} result{totalCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
