import { invoke } from '@tauri-apps/api/core';
import type { FilterCondition, FilterLogic } from '../components/filter/filter-types';

export interface FilterPreset {
  id: string;
  name: string;
  tableName: string;
  conditions: FilterCondition[];
  logic: FilterLogic;
}

interface SaveFilterPresetPayload {
  name: string;
  tableName: string;
  conditions: FilterCondition[];
  logic: FilterLogic;
}

export const saveFilterPreset = (payload: SaveFilterPresetPayload): Promise<FilterPreset> =>
  invoke('save_filter_preset', { payload });

export const loadFilterPresets = (tableName: string): Promise<FilterPreset[]> =>
  invoke('load_filter_presets', { tableName });

export const deleteFilterPreset = (id: string): Promise<void> =>
  invoke('delete_filter_preset', { id });
