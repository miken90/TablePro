import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionTagFilter } from "./connection-tag-filter";
import type { SavedConnection } from "../../types/connection";

interface ConnectionSearchProps {
  value: string;
  onChange: (value: string) => void;
  connections?: SavedConnection[];
}

export function ConnectionSearch({ value, onChange, connections }: ConnectionSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeTagFilter, setTagFilter } = useConnectionStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !isInputFocused()) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search connections…"
          className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-xs text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder:text-zinc-500"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {connections && (
        <ConnectionTagFilter
          connections={connections}
          activeTagFilter={activeTagFilter}
          onTagFilterChange={setTagFilter}
        />
      )}
    </div>
  );
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}
