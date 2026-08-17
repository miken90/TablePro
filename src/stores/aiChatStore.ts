import { create } from "zustand";
import { Channel, invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./settingsStore";
import { useConnectionStore } from "./connectionStore";
import type { AiProviderConfig, AiFeatureRoute } from "../types/settings";

// -- Types ------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  connectionName: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface AiStreamChunk {
  type: "started" | "delta" | "done" | "error";
  conversationId?: string;
  text?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  message?: string;
}

// -- Store ------------------------------------------------------------------

interface AiChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;

  loadConversations: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  newConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  cancelStream: () => Promise<void>;
  insertToEditor: (sql: string) => void;
}

/** Strip `<think>...</think>` blocks from AI responses (reasoning models). */
function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function generateId(): string {
  return crypto.randomUUID();
}

function resolveProviderForChat(): { config: AiProviderConfig; model: string } | null {
  const ai = useSettingsStore.getState().settings.ai;
  const route = ai.featureRouting.find((r: AiFeatureRoute) => r.feature === "chat");
  if (route) {
    const provider = ai.providers.find((p: AiProviderConfig) => p.id === route.providerId && p.isEnabled);
    if (provider) return { config: provider, model: route.model };
  }
  const first = ai.providers.find((p: AiProviderConfig) => p.isEnabled);
  if (first) return { config: first, model: first.model };
  return null;
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  error: null,

  loadConversations: async () => {
    try {
      const conversations: Conversation[] = await invoke("ai_list_conversations");
      set({ conversations });
    } catch (err) {
      console.error("Failed to load AI conversations:", err);
    }
  },

  switchConversation: async (id) => {
    try {
      const data: { conversation: Conversation; messages: ChatMessage[] } =
        await invoke("ai_get_conversation", { id });
      set({
        activeConversationId: id,
        messages: data.messages,
        error: null,
      });
    } catch (err) {
      console.error("Failed to switch conversation:", err);
    }
  },

  newConversation: async () => {
    const id = generateId();
    const connectionName = useConnectionStore.getState().selectedConnectionId
      ? Array.from(useConnectionStore.getState().connections.values())
          .find((c) => c.id === useConnectionStore.getState().selectedConnectionId)?.name ?? null
      : null;

    try {
      await invoke("ai_create_conversation", {
        id,
        title: "New Chat",
        connectionName,
      });
      set({
        activeConversationId: id,
        messages: [],
        error: null,
      });
      await get().loadConversations();
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
    return id;
  },

  deleteConversation: async (id) => {
    try {
      await invoke("ai_delete_conversation", { id });
      const state = get();
      if (state.activeConversationId === id) {
        set({ activeConversationId: null, messages: [] });
      }
      await get().loadConversations();
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  },

  clearAllConversations: async () => {
    try {
      await invoke("ai_clear_all_conversations");
      set({ conversations: [], activeConversationId: null, messages: [], error: null });
    } catch (err) {
      console.error("Failed to clear conversations:", err);
    }
  },

  sendMessage: async (content) => {
    const state = get();
    let conversationId = state.activeConversationId;

    if (!conversationId) {
      conversationId = await get().newConversation();
    }

    // Update conversation title from first message
    const existingMessages = get().messages;
    if (existingMessages.length === 0) {
      const title = content.slice(0, 50).replace(/\n/g, " ").trim() || "New Chat";
      // No separate update-title IPC; title was set at creation.
      // We update the list in-memory.
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, title } : c,
        ),
      }));
    }

    const resolved = resolveProviderForChat();
    if (!resolved) {
      set({ error: "No AI provider configured. Go to Settings → AI to add one." });
      return;
    }

    // Save user message
    const userMsg: ChatMessage = {
      id: generateId(),
      conversationId: conversationId!,
      role: "user",
      content,
      tokenCount: null,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      error: null,
    }));

    try {
      await invoke("ai_save_message", { message: userMsg });
    } catch {
      // non-critical
    }

    // Prepare assistant placeholder
    const assistantMsgId = generateId();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      conversationId: conversationId!,
      role: "assistant",
      content: "",
      tokenCount: null,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, assistantMsg] }));

    // Build system prompt if connected
    let systemPrompt: string | undefined;
    const connId = useConnectionStore.getState().selectedConnectionId;
    if (connId) {
      const sessionId = useConnectionStore.getState().getSessionId(connId);
      if (sessionId) {
        try {
          systemPrompt = await invoke("ai_build_context", {
            sessionId,
            template: "chat",
          });
        } catch {
          // proceed without schema context
        }
      }
    }

    // Build message history for API
    const apiMessages = get()
      .messages.filter((m) => m.role !== "system" && m.id !== assistantMsgId)
      .map((m) => ({ role: m.role, content: m.content }));

    // Create channel for streaming
    const channel = new Channel<AiStreamChunk>();
    channel.onmessage = (chunk: AiStreamChunk) => {
      switch (chunk.type) {
        case "delta":
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: stripThinkBlocks(m.content + (chunk.text ?? "")) }
                : m,
            ),
          }));
          break;
        case "done":
          set({ isStreaming: false });
          // Persist assistant message
          {
            const finalMsg = get().messages.find((m) => m.id === assistantMsgId);
            if (finalMsg) {
              invoke("ai_save_message", {
                message: { ...finalMsg, tokenCount: chunk.usage?.totalTokens ?? null },
              }).catch(() => {});
            }
          }
          get().loadConversations();
          break;
        case "error":
          set({
            isStreaming: false,
            error: chunk.message ?? "An error occurred",
          });
          break;
      }
    };

    try {
      await invoke("ai_chat_stream", {
        request: {
          providerConfig: {
            ...resolved.config,
            model: resolved.model,
          },
          messages: apiMessages,
          systemPrompt: systemPrompt ?? null,
          conversationId: conversationId!,
        },
        channel,
      });
    } catch (err) {
      set({
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  retryLastMessage: async () => {
    const messages = get().messages;
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // Remove the last assistant message (the one we want to regenerate)
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== lastAssistant.id),
      }));
    }

    // Re-send the last user message
    await get().sendMessage(lastUserMsg.content);
  },

  cancelStream: async () => {
    const conversationId = get().activeConversationId;
    if (!conversationId) return;
    try {
      await invoke("ai_cancel_chat", { conversationId });
    } catch {
      // noop
    }
    set({ isStreaming: false });
  },

  insertToEditor: (_sql: string) => {
    // Will be wired in Phase 11 polish via EditorViewContext
  },
}));
