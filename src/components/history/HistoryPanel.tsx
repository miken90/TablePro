import { useEffect, useCallback, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useHistoryStore } from "../../stores/history";
import { Search, Trash2, X, Clock, Database, Clipboard, Check } from "lucide-react";
import { Field } from "../ui";

interface HistoryPanelProps {
  onSelectQuery: (query: string) => void;
}

/** Renders inside the right dock (M2) — the dock owns the close control and
 *  Escape handling, so this panel is content only. */
export function HistoryPanel({ onSelectQuery }: HistoryPanelProps) {
  const { t } = useTranslation();
  const entries = useHistoryStore((s) => s.entries);
  const isLoading = useHistoryStore((s) => s.isLoading);
  const fetchRecent = useHistoryStore((s) => s.fetchRecent);
  const search = useHistoryStore((s) => s.search);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const deleteEntry = useHistoryStore((s) => s.deleteEntry);
  const [searchText, setSearchText] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchText(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (text.trim()) {
          search(text);
        } else {
          fetchRecent();
        }
      }, 300);
    },
    [search, fetchRecent],
  );

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  const truncateQuery = (query: string, maxLen = 120) => {
    const oneLine = query.replace(/\s+/g, " ").trim();
    return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + "…" : oneLine;
  };

  const handleCopy = useCallback((e: React.MouseEvent, id: number, query: string) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(query)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => {
          setCopiedId((current) => (current === id ? null : current));
        }, 2000);
      })
      .catch(() => {
        // noop
      });
  }, []);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-text-muted" />
          <span className="text-xs font-medium text-text-primary">{t("history.title")}</span>
        </div>
        <button
          onClick={clearAll}
          className="rounded p-1 text-xs text-text-muted transition hover:bg-surface-muted hover:text-red-500"
          title={t("history.clearAll")}
          aria-label={t("history.clearAll")}
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-border p-2">
        <Field>
          <Search size={12} className="text-text-muted" aria-hidden="true" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("history.searchPlaceholder")}
            aria-label={t("history.searchLabel")}
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-secondary"
          />
        </Field>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-xs text-text-secondary">{t("common.loading")}</div>
        )}
        {!isLoading && entries.length === 0 && (
          <div className="p-4 text-center text-xs text-text-secondary">
            {t("history.noHistory")}
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onSelectQuery(entry.query)}
            className="group cursor-pointer border-b border-border-subtle px-3 py-2 transition hover:bg-surface-hover"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 font-mono text-xs text-text-primary">
                {truncateQuery(entry.query)}
              </p>
              <div className="hidden items-center gap-0.5 group-hover:flex">
                <button
                  onClick={(e) => handleCopy(e, entry.id, entry.query)}
                  className="rounded p-0.5 text-text-muted transition hover:text-blue-500"
                  title={t("history.copyQuery")}
                >
                  {copiedId === entry.id ? (
                    <Check size={10} className="text-green-500" />
                  ) : (
                    <Clipboard size={10} />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteEntry(entry.id);
                  }}
                  className="rounded p-0.5 text-text-muted transition hover:text-red-500"
                  title={t("history.deleteEntry")}
                >
                  <X size={10} />
                </button>
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-text-secondary">
              {entry.database && (
                <span className="flex items-center gap-0.5">
                  <Database size={9} />
                  {entry.database}
                </span>
              )}
              <span>{entry.execution_time_ms.toFixed(1)}ms</span>
              {entry.row_count > 0 && <span>{entry.row_count} rows</span>}
              <span
                className={
                  entry.status === "error" ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-500"
                }
              >
                {entry.status}
              </span>
              <span className="ml-auto">{formatTime(entry.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
