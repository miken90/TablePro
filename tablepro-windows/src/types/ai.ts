export type AIProviderType = "openai" | "anthropic" | "gemini" | "ollama";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIConversation {
  id: string;
  messages: ChatMessage[];
}

export const AI_PROVIDERS: {
  value: AIProviderType;
  label: string;
  defaultModel: string;
  models: string[];
}[] = [
  {
    value: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-sonnet-4-5-20250514",
    models: [
      "claude-sonnet-4-5-20250514",
      "claude-haiku-4-5-20251001",
      "claude-opus-4-20250514",
    ],
  },
  {
    value: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-flash"],
  },
  {
    value: "ollama",
    label: "Ollama (Local)",
    defaultModel: "llama3",
    models: ["llama3", "codellama", "mistral", "mixtral"],
  },
];
