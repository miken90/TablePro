import { create } from "zustand";
import type { FilterCondition, FilterPreset } from "../types/filter";

interface FilterState {
  conditions: FilterCondition[];
  quickSearch: string;
  presets: FilterPreset[];
  activePresetName: string | null;
  isExpanded: boolean;

  addCondition: () => void;
  removeCondition: (index: number) => void;
  updateCondition: (index: number, condition: Partial<FilterCondition>) => void;
  clearAll: () => void;
  setQuickSearch: (text: string) => void;
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
  toggleExpanded: () => void;
}

function createEmptyCondition(): FilterCondition {
  return {
    column: "",
    operator: "eq",
    value: null,
    value2: null,
    logical_op: "and",
  };
}

export const useFilterStore = create<FilterState>((set, get) => ({
  conditions: [],
  quickSearch: "",
  presets: [],
  activePresetName: null,
  isExpanded: false,

  addCondition: () => {
    set((s) => ({
      conditions: [...s.conditions, createEmptyCondition()],
      isExpanded: true,
    }));
  },

  removeCondition: (index) => {
    set((s) => ({
      conditions: s.conditions.filter((_, i) => i !== index),
    }));
  },

  updateCondition: (index, partial) => {
    set((s) => ({
      conditions: s.conditions.map((c, i) =>
        i === index ? { ...c, ...partial } : c,
      ),
      activePresetName: null,
    }));
  },

  clearAll: () => {
    set({ conditions: [], activePresetName: null });
  },

  setQuickSearch: (text) => {
    set({ quickSearch: text });
  },

  savePreset: (name) => {
    set((s) => {
      const existing = s.presets.findIndex((p) => p.name === name);
      const preset: FilterPreset = { name, conditions: [...s.conditions] };
      const presets = [...s.presets];
      if (existing >= 0) {
        presets[existing] = preset;
      } else {
        presets.push(preset);
      }
      return { presets, activePresetName: name };
    });
  },

  loadPreset: (name) => {
    const preset = get().presets.find((p) => p.name === name);
    if (preset) {
      set({
        conditions: [...preset.conditions],
        activePresetName: name,
        isExpanded: true,
      });
    }
  },

  deletePreset: (name) => {
    set((s) => ({
      presets: s.presets.filter((p) => p.name !== name),
      activePresetName: s.activePresetName === name ? null : s.activePresetName,
    }));
  },

  toggleExpanded: () => {
    set((s) => ({ isExpanded: !s.isExpanded }));
  },
}));
