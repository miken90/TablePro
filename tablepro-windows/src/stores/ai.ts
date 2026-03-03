import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, AIProviderType } from "../types/ai";
import { AI_PROVIDERS } from "../types/ai";

interface AIState {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedProvider: AIProviderType;
  selectedModel: string;
  isPanelOpen: boolean;

  sendMessage: (content: string, connectionId: string | null) => Promise<void>;
  clearChat: () => void;
  setProvider: (provider: AIProviderType) => void;
  setModel: (model: string) => void;
  togglePanel: () => void;
  setPanel: (open: boolean) => void;
}

async function getApiKey(provider: AIProviderType): Promise<string> {
  try {
    const key = await invoke<string | null>("ai_load_api_key", { provider });
    return key ?? "";
  } catch {
    return "";
  }
}

function getBaseUrl(provider: AIProviderType): string | undefined {
  if (provider === "ollama") return "http://localhost:11434/v1";
  return undefined;
}

export const useAIStore = create<AIState>((set, get) => ({
  messages: [],
  isLoading: false,
  selectedProvider: "openai",
  selectedModel: "gpt-4o",
  isPanelOpen: false,

  sendMessage: async (content, connectionId) => {
    const { selectedProvider, selectedModel, messages } = get();

    const userMessage: ChatMessage = { role: "user", content };
    const updatedMessages = [...messages, userMessage];
    set({ messages: updatedMessages, isLoading: true });

    try {
      const apiKey = await getApiKey(selectedProvider);
      const baseUrl = getBaseUrl(selectedProvider);

      const includeSchema =
        connectionId != null;

      const response = await invoke<string>("ai_chat", {
        connectionId,
        messages: updatedMessages,
        provider: selectedProvider,
        apiKey,
        model: selectedModel,
        baseUrl: baseUrl ?? null,
        includeSchema,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response,
      };
      set({ messages: [...updatedMessages, assistantMessage] });
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Error: ${String(err)}`,
      };
      set({ messages: [...updatedMessages, errorMessage] });
    } finally {
      set({ isLoading: false });
    }
  },

  clearChat: () => set({ messages: [] }),

  setProvider: (provider) => {
    const providerConfig = AI_PROVIDERS.find((p) => p.value === provider);
    set({
      selectedProvider: provider,
      selectedModel: providerConfig?.defaultModel ?? "gpt-4o",
    });
  },

  setModel: (model) => set({ selectedModel: model }),

  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),

  setPanel: (open) => set({ isPanelOpen: open }),
}));
