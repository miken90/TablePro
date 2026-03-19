import { useMemo, useState } from "react";

const TAG_STYLES: Record<string, string> = {
  production: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  staging: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  development: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  testing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  local: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
};

const PRESET_TAGS = ["production", "staging", "development", "testing", "local"];

interface ConnectionTagPickerProps {
  value?: string;
  onChange: (value?: string) => void;
}

export function tagClassName(tag?: string): string {
  if (!tag) {
    return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300";
  }
  return TAG_STYLES[tag.toLowerCase()] ?? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
}

export function formatTagLabel(tag?: string): string {
  if (!tag) return "";
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function ConnectionTagPicker({ value, onChange }: ConnectionTagPickerProps) {
  const normalized = value ?? "";
  const normalizedLower = normalized.toLowerCase();
  const isPreset = PRESET_TAGS.includes(normalizedLower);
  const [customMode, setCustomMode] = useState(Boolean(normalized) && !isPreset);

  const selectValue = useMemo(() => {
    if (!normalized) return "";
    if (isPreset) return normalizedLower;
    return "__custom__";
  }, [isPreset, normalized, normalizedLower]);

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) {
            setCustomMode(false);
            onChange(undefined);
            return;
          }
          if (next === "__custom__") {
            setCustomMode(true);
            onChange(isPreset ? undefined : value);
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
        className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        <option value="">None</option>
        {PRESET_TAGS.map((tag) => (
          <option key={tag} value={tag}>
            {formatTagLabel(tag)}
          </option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>

      {customMode && (
        <input
          value={isPreset ? "" : normalized}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="Enter custom tag"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
        />
      )}
    </div>
  );
}
