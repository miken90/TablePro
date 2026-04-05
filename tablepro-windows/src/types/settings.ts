export type ProviderType = "openai" | "openrouter" | "lmstudio" | "ollama" | "custom";

export interface AiProviderConfig {
  id: string;
  providerType: ProviderType;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isEnabled: boolean;
}

export type AiFeature = "chat" | "explainQuery" | "fixError" | "inlineSuggestions";

export interface AiFeatureRoute {
  feature: AiFeature;
  providerId: string;
  model: string;
}

export interface AiSettings {
  providers: AiProviderConfig[];
  featureRouting: AiFeatureRoute[];
  maxSchemaTables: number;
  enableInlineSuggestions: boolean;
}

export const PROVIDER_PRESETS: Record<ProviderType, { baseUrl: string; displayName: string }> = {
  openai: { baseUrl: "https://api.openai.com", displayName: "OpenAI" },
  openrouter: { baseUrl: "https://openrouter.ai", displayName: "OpenRouter" },
  lmstudio: { baseUrl: "http://localhost:1234", displayName: "LM Studio" },
  ollama: { baseUrl: "http://localhost:11434", displayName: "Ollama" },
  custom: { baseUrl: "", displayName: "Custom" },
};

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  chat: "Chat",
  explainQuery: "Explain Query",
  fixError: "Fix Error",
  inlineSuggestions: "Inline Suggestions",
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  providers: [],
  featureRouting: [],
  maxSchemaTables: 20,
  enableInlineSuggestions: true,
};

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
  ai: AiSettings;
  hasCompletedOnboarding: boolean;
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
  ai: DEFAULT_AI_SETTINGS,
  hasCompletedOnboarding: false,
};
