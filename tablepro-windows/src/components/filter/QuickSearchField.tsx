import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useFilterStore } from "../../stores/filter";

interface QuickSearchFieldProps {
  onSearch: (text: string) => void;
}

export function QuickSearchField({ onSearch }: QuickSearchFieldProps) {
  const quickSearch = useFilterStore((s) => s.quickSearch);
  const setQuickSearch = useFilterStore((s) => s.setQuickSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(quickSearch);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [quickSearch, onSearch]);

  return (
    <div className="relative flex items-center">
      <Search size={12} className="absolute left-2 text-zinc-500" />
      <input
        type="text"
        value={quickSearch}
        onChange={(e) => setQuickSearch(e.target.value)}
        placeholder="Quick search..."
        className="w-48 rounded border border-zinc-200 bg-white py-1 pl-7 pr-7 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500"
      />
      {quickSearch && (
        <button
          onClick={() => setQuickSearch("")}
          className="absolute right-2 text-zinc-600 hover:text-zinc-400"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
