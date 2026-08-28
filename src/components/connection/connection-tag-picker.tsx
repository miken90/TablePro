import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";

const TAG_STYLES: Record<string, string> = {
  production: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  staging: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  development: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  testing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  local: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
};

const TAG_COLOR_OPTIONS = [
  { name: "red", class: "bg-red-500" },
  { name: "amber", class: "bg-amber-500" },
  { name: "green", class: "bg-green-500" },
  { name: "blue", class: "bg-blue-500" },
  { name: "violet", class: "bg-violet-500" },
  { name: "pink", class: "bg-pink-500" },
  { name: "cyan", class: "bg-cyan-500" },
  { name: "zinc", class: "bg-zinc-500" },
];

const COLOR_TAG_STYLES: Record<string, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  zinc: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
};

const PRESET_TAGS = ["production", "staging", "development", "testing", "local"];

/** Custom tags persisted in localStorage */
function loadCustomTags(): { name: string; color: string }[] {
  try {
    const raw = localStorage.getItem("tp:customTags");
    if (raw) return JSON.parse(raw) as { name: string; color: string }[];
  } catch { /* ignore */ }
  return [];
}

function saveCustomTags(tags: { name: string; color: string }[]) {
  try { localStorage.setItem("tp:customTags", JSON.stringify(tags)); } catch { /* ignore */ }
}

interface ConnectionTagPickerProps {
  value?: string;
  onChange: (value?: string) => void;
  onTagDeleted?: (tag: string) => void;
}

export function tagClassName(tag?: string): string {
  if (!tag) {
    return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300";
  }
  if (TAG_STYLES[tag.toLowerCase()]) {
    return TAG_STYLES[tag.toLowerCase()];
  }
  // Check custom tag color
  const customs = loadCustomTags();
  const custom = customs.find((c) => c.name.toLowerCase() === tag.toLowerCase());
  if (custom && COLOR_TAG_STYLES[custom.color]) {
    return COLOR_TAG_STYLES[custom.color];
  }
  return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
}

export function formatTagLabel(tag?: string): string {
  if (!tag) return "";
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function ConnectionTagPicker({ value, onChange, onTagDeleted }: ConnectionTagPickerProps) {
  const { t } = useTranslation();
  const normalized = value ?? "";
  const normalizedLower = normalized.toLowerCase();
  const [customTags, setCustomTags] = useState(loadCustomTags);
  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("violet");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const presets = PRESET_TAGS.map((tag) => ({ name: tag, isPreset: true }));
    const customs = customTags.map((ct) => ({ name: ct.name, isPreset: false }));
    return [...presets, ...customs];
  }, [customTags]);

  const isPreset = PRESET_TAGS.includes(normalizedLower);
  const isCustom = customTags.some((ct) => ct.name.toLowerCase() === normalizedLower);
  const [customMode, setCustomMode] = useState(Boolean(normalized) && !isPreset && !isCustom);

  const selectValue = useMemo(() => {
    if (!normalized) return "";
    if (isPreset) return normalizedLower;
    const customMatch = customTags.find((ct) => ct.name.toLowerCase() === normalizedLower);
    if (customMatch) return `custom:${customMatch.name}`;
    return "__custom__";
  }, [isPreset, normalized, normalizedLower, customTags]);

  const handleCreateTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const exists = allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    const updated = [...customTags, { name: trimmed, color: newTagColor }];
    saveCustomTags(updated);
    setCustomTags(updated);
    onChange(trimmed);
    setShowCreate(false);
    setNewTagName("");
    setNewTagColor("violet");
    setCustomMode(false);
  };

  const handleDeleteTag = (tagName: string) => {
    const updated = customTags.filter((ct) => ct.name.toLowerCase() !== tagName.toLowerCase());
    saveCustomTags(updated);
    setCustomTags(updated);
    if (normalizedLower === tagName.toLowerCase()) {
      onChange(undefined);
    }
    onTagDeleted?.(tagName);
    setConfirmDelete(null);
  };

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
            onChange(isPreset || isCustom ? undefined : value);
            return;
          }
          if (next.startsWith("custom:")) {
            setCustomMode(false);
            onChange(next.slice(7));
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
        className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        <option value="">None</option>
        {PRESET_TAGS.map((tag) => (
          <option key={tag} value={tag}>
            {formatTagLabel(tag)}
          </option>
        ))}
        {customTags.length > 0 && (
          <optgroup label="Custom">
            {customTags.map((ct) => (
              <option key={ct.name} value={`custom:${ct.name}`}>
                {formatTagLabel(ct.name)}
              </option>
            ))}
          </optgroup>
        )}
        <option value="__custom__">Custom…</option>
      </select>

      {customMode && (
        <input
          value={isPreset || isCustom ? "" : normalized}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="Enter custom tag"
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
        />
      )}

      {/* Create new tag inline */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-[10px] text-accent-blue hover:underline"
        >
          <Plus size={10} />
          {t("connection.tag.createNew")}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          <input
            autoFocus
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTag();
              if (e.key === "Escape") { setShowCreate(false); setNewTagName(""); }
            }}
            placeholder={t("connection.tag.namePlaceholder")}
            className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500">{t("connection.tag.colors")}:</span>
            {TAG_COLOR_OPTIONS.map((c) => (
              <button
                key={c.name}
                onClick={() => setNewTagColor(c.name)}
                className={`h-3.5 w-3.5 rounded-full ${c.class} ${
                  newTagColor === c.name ? "ring-2 ring-accent-blue ring-offset-1" : ""
                }`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className="button-primary rounded px-2 py-0.5 text-[10px] disabled:opacity-50"
            >
              {t("connection.tag.createNew")}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewTagName(""); }}
              className="rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {t("connection.tag.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Delete custom tags */}
      {customTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {customTags.map((ct) => (
            <div key={ct.name} className="group relative">
              {confirmDelete === ct.name ? (
                <div className="flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-0.5 dark:border-red-800 dark:bg-red-950">
                  <span className="text-[10px] text-red-700 dark:text-red-300">
                    {t("connection.tag.deleteConfirm", { tag: ct.name })}
                  </span>
                  <button
                    onClick={() => handleDeleteTag(ct.name)}
                    className="text-[10px] font-medium text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    {t("connection.tag.delete")}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-700"
                  >
                    {t("connection.tag.cancel")}
                  </button>
                </div>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${tagClassName(ct.name)}`}>
                  {formatTagLabel(ct.name)}
                  <button
                    onClick={() => setConfirmDelete(ct.name)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Delete tag ${ct.name}`}
                  >
                    <Trash2 size={9} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
