import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, X, Eye, ChevronDown, ChevronUp, Bookmark } from "lucide-react";
import { useFilterStore } from "../../stores/filter";
import { FilterRow } from "./FilterRow";
import type { DatabaseType } from "../../types";

interface FilterPanelProps {
  columns: string[];
  dbType: DatabaseType;
  onApply: (whereClause: string) => void;
}

export function FilterPanel({ columns, dbType, onApply }: FilterPanelProps) {
  const conditions = useFilterStore((s) => s.conditions);
  const addCondition = useFilterStore((s) => s.addCondition);
  const clearAll = useFilterStore((s) => s.clearAll);
  const isExpanded = useFilterStore((s) => s.isExpanded);
  const toggleExpanded = useFilterStore((s) => s.toggleExpanded);
  const presets = useFilterStore((s) => s.presets);
  const activePresetName = useFilterStore((s) => s.activePresetName);
  const savePreset = useFilterStore((s) => s.savePreset);
  const loadPreset = useFilterStore((s) => s.loadPreset);
  const deletePreset = useFilterStore((s) => s.deletePreset);

  const [sqlPreview, setSqlPreview] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [showPresetInput, setShowPresetInput] = useState(false);

  const hasValidConditions = conditions.some((c) => c.column !== "");

  const handlePreview = async () => {
    if (!hasValidConditions) return;
    try {
      const valid = conditions.filter((c) => c.column !== "");
      const sql = await invoke<string>("generate_filter_sql", {
        conditions: valid,
        db_type: dbType,
      });
      setSqlPreview(sql);
    } catch (e) {
      setSqlPreview(`Error: ${e}`);
    }
  };

  const handleApply = async () => {
    if (!hasValidConditions) {
      onApply("");
      return;
    }
    try {
      const valid = conditions.filter((c) => c.column !== "");
      const sql = await invoke<string>("generate_filter_sql", {
        conditions: valid,
        db_type: dbType,
      });
      onApply(sql);
    } catch (e) {
      console.error("Filter error:", e);
    }
  };

  const handleSavePreset = () => {
    if (presetName.trim()) {
      savePreset(presetName.trim());
      setPresetName("");
      setShowPresetInput(false);
    }
  };

  return (
    <div className="border-b border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex h-7 items-center gap-2 px-3">
        <button
          onClick={toggleExpanded}
          className="flex items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Filters
          {conditions.length > 0 && (
            <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">
              {conditions.length}
            </span>
          )}
        </button>

        {!isExpanded && conditions.length > 0 && (
          <span className="text-[10px] text-zinc-500">
            {conditions.length} condition{conditions.length > 1 ? "s" : ""} active
          </span>
        )}

        <div className="flex-1" />

        {presets.length > 0 && (
          <select
            value={activePresetName ?? ""}
            onChange={(e) => e.target.value && loadPreset(e.target.value)}
            className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
          >
            <option value="">Presets...</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 px-3 pb-3">
          {conditions.map((condition, index) => (
            <FilterRow
              key={index}
              index={index}
              condition={condition}
              columns={columns}
              showLogicalOp={index > 0}
            />
          ))}

          <div className="flex items-center gap-2">
            <button
              onClick={addCondition}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Plus size={12} />
              Add Filter
            </button>

            {conditions.length > 0 && (
              <>
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                >
                  <X size={12} />
                  Clear All
                </button>

                <button
                  onClick={handlePreview}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-blue-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
                >
                  <Eye size={12} />
                  Preview SQL
                </button>

                <button
                  onClick={() => setShowPresetInput(!showPresetInput)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-amber-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-amber-400"
                >
                  <Bookmark size={12} />
                  Save
                </button>

                <div className="flex-1" />

                <button
                  onClick={handleApply}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-500"
                >
                  Apply
                </button>
              </>
            )}
          </div>

          {showPresetInput && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name..."
                className="w-48 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500"
                onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              />
              <button
                onClick={handleSavePreset}
                className="rounded bg-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              >
                Save
              </button>
              {activePresetName && (
                <button
                  onClick={() => deletePreset(activePresetName)}
                  className="text-xs text-red-500 hover:text-red-400"
                >
                  Delete "{activePresetName}"
                </button>
              )}
            </div>
          )}

          {sqlPreview && (
            <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-zinc-500">SQL Preview</span>
                <button
                  onClick={() => setSqlPreview(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
                >
                  <X size={12} />
                </button>
              </div>
              <pre className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sqlPreview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
