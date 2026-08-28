import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionTagFilter } from "./connection-tag-filter";
import type { SavedConnection } from "../../types/connection";
import { Field } from "../ui";

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
      <Field>
        <Search size={14} className="text-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search connections…"
          className="min-w-0 flex-1 bg-transparent text-ui-sm text-text-primary placeholder:text-text-secondary"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="rounded p-0.5 text-text-secondary hover:text-text-primary"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </Field>
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
