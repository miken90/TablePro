import { create } from "zustand";
import i18n from "../i18n";
import type { AppSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
import * as commands from "../ipc/commands";

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const settings = await commands.getSettings();
      set({ settings, isLoaded: true });
      if (settings.language && settings.language !== i18n.language) {
        void i18n.changeLanguage(settings.language);
      }
    } catch {
      // Use defaults if backend not ready
      set({ isLoaded: true });
    }
  },

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial };
    set({ settings: merged });
    if (partial.language && partial.language !== i18n.language) {
      void i18n.changeLanguage(partial.language);
    }
    try {
      await commands.setSettings(merged);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  },
}));
