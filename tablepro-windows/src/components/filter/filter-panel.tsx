import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Plus, Save, Trash2 } from 'lucide-react';
import type { ColumnInfo } from '../../types/query';
import { useFilterStore } from '../../stores/filterStore';
import {
  deleteFilterPreset,
  loadFilterPresets,
  saveFilterPreset,
  type FilterPreset,
} from '../../ipc/filter-commands';
import { FilterRow } from './filter-row';

interface FilterPanelProps {
  tabId: string;
  tableName?: string;
  columns: ColumnInfo[];
}

export function FilterPanel({ tabId, tableName, columns }: FilterPanelProps) {
  const tabState = useFilterStore((s) => s.byTab[tabId]);
  const initializeTab = useFilterStore((s) => s.initializeTab);
  const addCondition = useFilterStore((s) => s.addCondition);
  const updateCondition = useFilterStore((s) => s.updateCondition);
  const removeCondition = useFilterStore((s) => s.removeCondition);
  const setLogic = useFilterStore((s) => s.setLogic);
  const applyFilter = useFilterStore((s) => s.applyFilter);
  const clearFilter = useFilterStore((s) => s.clearFilter);
  const applyPreset = useFilterStore((s) => s.applyPreset);

  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(false);

  const conditions = tabState?.conditions ?? [];
  const logic = tabState?.logic ?? 'AND';

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId),
    [presets, selectedPresetId],
  );

  const refreshPresets = useCallback(async () => {
    if (!tableName) {
      setPresets([]);
      setSelectedPresetId('');
      return;
    }

    setPresetsLoading(true);
    try {
      const loaded = await loadFilterPresets(tableName);
      setPresets(loaded);
      if (!loaded.some((p) => p.id === selectedPresetId)) {
        setSelectedPresetId('');
      }
    } catch {
      setPresets([]);
      setSelectedPresetId('');
    } finally {
      setPresetsLoading(false);
    }
  }, [selectedPresetId, tableName]);

  useEffect(() => {
    initializeTab(tabId);
  }, [initializeTab, tabId]);

  useEffect(() => {
    void refreshPresets();
  }, [refreshPresets]);

  const handleApply = useCallback(() => {
    applyFilter(tabId);
  }, [applyFilter, tabId]);

  const handleClear = useCallback(() => {
    clearFilter(tabId);
  }, [clearFilter, tabId]);

  const handleSavePreset = useCallback(async () => {
    if (!tableName) return;

    const name = window.prompt('Preset name');
    if (!name || !name.trim()) return;

    try {
      const created = await saveFilterPreset({
        name: name.trim(),
        tableName,
        conditions,
        logic,
      });
      await refreshPresets();
      setSelectedPresetId(created.id);
    } catch {
      // ignore for now
    }
  }, [conditions, logic, refreshPresets, tableName]);

  const handleLoadPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    applyPreset(tabId, preset.conditions, preset.logic);
  }, [applyPreset, presets, tabId]);

  const handleDeletePreset = useCallback(async () => {
    if (!selectedPreset) return;

    try {
      await deleteFilterPreset(selectedPreset.id);
      setSelectedPresetId('');
      await refreshPresets();
    } catch {
      // ignore for now
    }
  }, [refreshPresets, selectedPreset]);

  return (
    <div className="flex items-start gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
      <Filter size={14} className="mt-1 flex-shrink-0 text-zinc-400" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {conditions.map((condition) => (
          <FilterRow
            key={condition.id}
            condition={condition}
            columns={columns}
            onChange={(updated) => updateCondition(tabId, condition.id, updated)}
            onRemove={() => removeCondition(tabId, condition.id)}
          />
        ))}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 pt-0.5">
        <button
          onClick={() => setLogic(tabId, logic === 'AND' ? 'OR' : 'AND')}
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="Toggle AND/OR logic"
        >
          {logic}
        </button>

        <button
          onClick={() => addCondition(tabId)}
          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"
          title="Add filter condition"
        >
          <Plus size={12} />
        </button>

        {tableName && (
          <>
            <select
              value={selectedPresetId}
              onChange={(event) => handleLoadPreset(event.target.value)}
              className="h-6 rounded border border-zinc-300 bg-white px-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
              disabled={presetsLoading}
            >
              <option value="">Presets</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>

            <button
              onClick={handleSavePreset}
              className="flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title="Save preset"
            >
              <Save size={10} />
              Save
            </button>

            <button
              onClick={handleDeletePreset}
              disabled={!selectedPreset}
              className="flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title="Delete selected preset"
            >
              <Trash2 size={10} />
            </button>
          </>
        )}

        <button
          onClick={handleApply}
          className="rounded bg-blue-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          Apply
        </button>

        <button
          onClick={handleClear}
          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
