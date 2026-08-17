import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { tagClassName, formatTagLabel } from "./connection-tag-picker";
import type { SavedConnection } from "../../types/connection";

interface ConnectionTagFilterProps {
  connections: SavedConnection[];
  activeTagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
}

interface TagInfo {
  name: string;
  count: number;
}

export function ConnectionTagFilter({
  connections,
  activeTagFilter,
  onTagFilterChange,
}: ConnectionTagFilterProps) {
  const { t } = useTranslation();

  const tags = useMemo<TagInfo[]>(() => {
    const counts = new Map<string, number>();
    for (const conn of connections) {
      if (conn.tag) {
        const key = conn.tag.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [connections]);

  if (tags.length === 0) return null;

  const isAllActive = activeTagFilter.length === 0;

  const toggleTag = (tag: string) => {
    const lower = tag.toLowerCase();
    if (activeTagFilter.includes(lower)) {
      onTagFilterChange(activeTagFilter.filter((t) => t !== lower));
    } else {
      onTagFilterChange([...activeTagFilter, lower]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1">
      <button
        onClick={() => onTagFilterChange([])}
        aria-label={t("connection.filter.clearAriaLabel")}
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
          isAllActive
            ? "bg-accent-blue/20 text-accent-blue ring-1 ring-accent-blue/40"
            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        }`}
      >
        {t("connection.filter.all")}
      </button>
      {tags.map((tag) => {
        const isActive = activeTagFilter.includes(tag.name);
        return (
          <button
            key={tag.name}
            onClick={() => toggleTag(tag.name)}
            aria-label={t("connection.filter.tagChipAriaLabel", { tag: formatTagLabel(tag.name) })}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              isActive
                ? `${tagClassName(tag.name)} ring-1 ring-current/30`
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {formatTagLabel(tag.name)}
            <span className="ml-1 opacity-60">{tag.count}</span>
          </button>
        );
      })}
    </div>
  );
}
