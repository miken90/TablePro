export interface AppSettings {
  pageSize: number;
  editorFont: string;
  editorFontSize: number;
  vimMode: boolean;
  theme: string;
  nullDisplay: string;
  defaultTimeoutSecs: number;
  /** 0=Off, 1=Silent, 2=Alert, 3=AlertFull, 4=SafeMode, 5=ReadOnly */
  safeModeLevel: number;
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
  safeModeLevel: 2,
  tabSize: 4,
  wordWrap: false,
  dateFormat: "iso",
};
