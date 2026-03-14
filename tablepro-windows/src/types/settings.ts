export interface AppSettings {
  pageSize: number;
  editorFont: string;
  editorFontSize: number;
  vimMode: boolean;
  theme: string;
  nullDisplay: string;
  defaultTimeoutSecs: number;
  safeMode: boolean;
  tabSize: number;
  wordWrap: boolean;
  dateFormat: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pageSize: 100,
  editorFont: "Consolas",
  editorFontSize: 14,
  vimMode: false,
  theme: "system",
  nullDisplay: "NULL",
  defaultTimeoutSecs: 30,
  safeMode: false,
  tabSize: 4,
  wordWrap: false,
  dateFormat: "iso",
};
