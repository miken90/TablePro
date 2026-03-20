import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search } from "lucide-react";

const COMMON_TYPES: Record<string, string[]> = {
  Numeric: ["INTEGER", "BIGINT", "SMALLINT", "DECIMAL", "NUMERIC", "FLOAT", "DOUBLE PRECISION", "REAL", "SERIAL", "BIGSERIAL"],
  String: ["VARCHAR(255)", "TEXT", "CHAR(1)", "CHARACTER VARYING(255)", "NVARCHAR(255)", "NTEXT"],
  "Date / Time": ["DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "DATETIME", "DATETIME2", "INTERVAL"],
  Boolean: ["BOOLEAN", "BOOL", "BIT"],
  JSON: ["JSON", "JSONB"],
  Binary: ["BYTEA", "BLOB", "BINARY", "VARBINARY(255)", "IMAGE"],
  Other: ["UUID", "ARRAY", "CIDR", "INET", "MACADDR", "XML", "MONEY"],
};

const ALL_TYPES = Object.values(COMMON_TYPES).flat();

interface TypePickerProps {
  value: string;
  onChange: (type: string) => void;
  disabled?: boolean;
}

export function TypePicker({ value, onChange, disabled }: TypePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback((type: string) => {
    onChange(type);
    setOpen(false);
    setSearch("");
  }, [onChange]);

  const filtered = search.trim()
    ? ALL_TYPES.filter(t => t.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 w-full text-left font-mono text-[11px] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-blue-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex-1 truncate">{value || "Select type…"}</span>
        <ChevronDown size={10} className="flex-shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-0.5 w-56 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-700">
            <Search size={11} className="text-zinc-400 flex-shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search types…"
              className="flex-1 text-[11px] bg-transparent outline-none text-zinc-700 dark:text-zinc-300 placeholder-zinc-400"
            />
          </div>
          <div className="overflow-auto max-h-52">
            {filtered ? (
              filtered.length > 0 ? (
                filtered.map(t => (
                  <button
                    key={t}
                    type="button"
                    className="w-full text-left px-3 py-1 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => handleSelect(t)}
                  >
                    {t}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-[11px] text-zinc-400">No matching types</div>
              )
            ) : (
              Object.entries(COMMON_TYPES).map(([category, types]) => (
                <div key={category}>
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide bg-zinc-50 dark:bg-zinc-800/50">
                    {category}
                  </div>
                  {types.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`w-full text-left px-3 py-0.5 text-[11px] font-mono hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                        t === value
                          ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                      onClick={() => handleSelect(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-zinc-200 dark:border-zinc-700 px-2 py-1">
            <input
              value={search}
              onChange={e => {
                handleSelect(e.target.value.toUpperCase());
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  handleSelect(search.toUpperCase() || value);
                }
              }}
              placeholder="Or type custom…"
              className="w-full text-[11px] font-mono px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
