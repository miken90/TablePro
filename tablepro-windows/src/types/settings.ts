export interface AppSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  editor: EditorSettings;
  dataGrid: DataGridSettings;
  ai: AISettings;
  history: HistorySettings;
  keyboard: KeyboardSettings;
}

export interface GeneralSettings {
  startupBehavior: "showWelcome" | "reopenLast";
  language: "system" | "en" | "vi";
  automaticallyCheckForUpdates: boolean;
  queryTimeoutSeconds: number;
  shareAnalytics: boolean;
}

export interface AppearanceSettings {
  theme: "system" | "light" | "dark";
  accentColor: string;
}

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  showLineNumbers: boolean;
  highlightCurrentLine: boolean;
  tabWidth: number;
  autoIndent: boolean;
  wordWrap: boolean;
  vimModeEnabled: boolean;
  showMinimap: boolean;
}

export interface DataGridSettings {
  rowHeight: "compact" | "normal" | "comfortable" | "spacious";
  dateFormat: string;
  nullDisplay: string;
  defaultPageSize: number;
  showAlternateRows: boolean;
}

export interface AISettings {
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  ollamaHost: string;
  defaultProvider: string;
  includeSchema: boolean;
  includeCurrentQuery: boolean;
}

export interface HistorySettings {
  maxEntries: number;
  maxDays: number;
  autoCleanup: boolean;
}

export interface KeyboardSettings {
  vimMode: boolean;
  customShortcuts: Record<string, string>;
}
