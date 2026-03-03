import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { applyAccentColor } from "../utils/theme";
import type { AppSettings } from "../types/settings";

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  resetSettings: () => Promise<void>;
  updateSection: <K extends keyof AppSettings>(
    section: K,
    value: AppSettings[K],
  ) => Promise<void>;
}

const defaultSettings: AppSettings = {
  general: {
    startupBehavior: "showWelcome",
    language: "system",
    automaticallyCheckForUpdates: true,
    queryTimeoutSeconds: 60,
    shareAnalytics: true,
  },
  appearance: {
    theme: "system",
    accentColor: "blue",
  },
  editor: {
    fontFamily: "Consolas",
    fontSize: 13,
    showLineNumbers: true,
    highlightCurrentLine: true,
    tabWidth: 4,
    autoIndent: true,
    wordWrap: false,
    vimModeEnabled: false,
    showMinimap: false,
  },
  dataGrid: {
    rowHeight: "normal",
    dateFormat: "yyyy-MM-dd HH:mm:ss",
    nullDisplay: "NULL",
    defaultPageSize: 1000,
    showAlternateRows: true,
  },
  ai: {
    openaiApiKey: "",
    anthropicApiKey: "",
    geminiApiKey: "",
    ollamaHost: "http://localhost:11434",
    defaultProvider: "openai",
    includeSchema: true,
    includeCurrentQuery: true,
  },
  history: {
    maxEntries: 10000,
    maxDays: 90,
    autoCleanup: true,
  },
  keyboard: {
    vimMode: false,
    customShortcuts: {},
  },
};

let systemThemeCleanup: (() => void) | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,

  loadSettings: async () => {
    set({ loading: true });
    try {
      const settings = await invoke<AppSettings>("get_settings");
      set({ settings });
      applyTheme(settings.appearance.theme);
      applyAccentColor(settings.appearance.accentColor);
    } catch {
      set({ settings: defaultSettings });
    } finally {
      set({ loading: false });
    }
  },

  updateSettings: async (settings: AppSettings) => {
    try {
      const updated = await invoke<AppSettings>("update_settings", {
        settings,
      });
      set({ settings: updated });
      applyTheme(updated.appearance.theme);
      applyAccentColor(updated.appearance.accentColor);
    } catch {
      // keep current state on error
    }
  },

  resetSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("reset_settings");
      set({ settings });
      applyTheme(settings.appearance.theme);
      applyAccentColor(settings.appearance.accentColor);
    } catch {
      set({ settings: defaultSettings });
    }
  },

  updateSection: async <K extends keyof AppSettings>(
    section: K,
    value: AppSettings[K],
  ) => {
    const current = get().settings;
    if (!current) return;
    const updated = { ...current, [section]: value };
    await get().updateSettings(updated);
  },
}));

function applyTheme(theme: string) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }

  if (theme === "system") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.classList.remove("light", "dark");
      root.classList.add(mq.matches ? "dark" : "light");
    };
    apply();
    mq.addEventListener("change", apply);
    systemThemeCleanup = () => mq.removeEventListener("change", apply);
  } else {
    root.classList.add(theme);
  }
}
