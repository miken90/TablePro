import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useFilterStore } from '../../stores/filterStore';
import {
  deleteFilterPreset,
  loadFilterPresets,
  saveFilterPreset,
  type FilterPreset,
} from '../../ipc/filter-commands';

interface FilterPresetMenuProps {
  tabId: string;
  tableName?: string;
}

/**
 * Dropdown to load, save and delete filter presets.
 * Integrates with the backend via IPC filter-commands.
 */
export function FilterPresetMenu({ tabId, tableName }: FilterPresetMenuProps) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const conditions = useFilterStore((s) => s.byTab[tabId]?.conditions ?? []);
  const logic = useFilterStore((s) => s.byTab[tabId]?.logic ?? 'AND');
  const applyPreset = useFilterStore((s) => s.applyPreset);

  const refreshPresets = useCallback(async () => {
    if (!tableName) {
      setPresets([]);
      return;
    }
    setLoading(true);
    try {
      const loaded = await loadFilterPresets(tableName);
      setPresets(loaded);
    } catch {
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    if (open) {
      void refreshPresets();
    }
  }, [open, refreshPresets]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleLoadPreset = useCallback(
    (preset: FilterPreset) => {
      applyPreset(tabId, preset.conditions, preset.logic);
      setOpen(false);
    },
    [applyPreset, tabId],
  );

  const handleSavePreset = useCallback(async () => {
    if (!tableName) return;
    const name = window.prompt('Preset name');
    if (!name?.trim()) return;

    try {
      await saveFilterPreset({ name: name.trim(), tableName, conditions, logic });
      await refreshPresets();
    } catch {
      // ignore
    }
  }, [conditions, logic, refreshPresets, tableName]);

  const handleDeletePreset = useCallback(
    async (preset: FilterPreset, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await deleteFilterPreset(preset.id);
        await refreshPresets();
      } catch {
        // ignore
      }
    },
    [refreshPresets],
  );

  if (!tableName) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        title="Filter presets"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bookmark size={10} />
        Presets
        <ChevronDown size={9} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
          {loading && (
            <div className="px-3 py-2 text-xs text-zinc-400">Loading…</div>
          )}

          {!loading && presets.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400">No saved presets</div>
          )}

          {!loading && presets.map((preset) => (
            <button
              key={preset.id}
              role="menuitem"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
              onClick={() => handleLoadPreset(preset)}
            >
              <span className="truncate">{preset.name}</span>
              <button
                className="ml-2 flex-shrink-0 rounded p-0.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400"
                onClick={(e) => void handleDeletePreset(preset, e)}
                aria-label={`Delete preset ${preset.name}`}
                title="Delete"
              >
                <Trash2 size={10} />
              </button>
            </button>
          ))}

          <div className="border-t border-zinc-200 dark:border-zinc-700">
            <button
              role="menuitem"
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              onClick={() => void handleSavePreset()}
            >
              <Plus size={10} />
              Save current filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
