import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAiChatStore } from "../../stores/aiChatStore";
import { AiChatInput } from "./ai-chat-input";
import { AiChatMessage } from "./ai-chat-message";
import { AiConversationList } from "./ai-conversation-list";

/** Renders inside the right dock (M2) — the dock owns the close control and
 *  Escape handling, so this panel is content only. */
export function AiChatPanel() {
  const { t } = useTranslation();
  const conversations = useAiChatStore((s) => s.conversations);
  const activeConversationId = useAiChatStore((s) => s.activeConversationId);
  const messages = useAiChatStore((s) => s.messages);
  const isStreaming = useAiChatStore((s) => s.isStreaming);
  const error = useAiChatStore((s) => s.error);
  const loadConversations = useAiChatStore((s) => s.loadConversations);
  const switchConversation = useAiChatStore((s) => s.switchConversation);
  const newConversation = useAiChatStore((s) => s.newConversation);
  const deleteConversation = useAiChatStore((s) => s.deleteConversation);
  const sendMessage = useAiChatStore((s) => s.sendMessage);
  const retryLastMessage = useAiChatStore((s) => s.retryLastMessage);
  const cancelStream = useAiChatStore((s) => s.cancelStream);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-purple-500" />
          <span className="text-xs font-medium text-text-primary">{t("aiChat.title")}</span>
        </div>
        <AiConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSwitch={switchConversation}
          onNew={() => void newConversation()}
          onDelete={deleteConversation}
        />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Sparkles size={24} className="text-text-muted" />
            <p className="text-xs text-text-secondary">
              {t("aiChat.emptyMessage")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {messages.map((msg, idx) => (
              <AiChatMessage
                key={msg.id}
                message={msg}
                isLast={idx === messages.length - 1 && msg.role === "assistant"}
                isStreaming={isStreaming}
                onRetry={
                  idx === messages.length - 1 && msg.role === "assistant" && !isStreaming
                    ? () => void retryLastMessage()
                    : undefined
                }
              />
            ))}
          </div>
        )}
        {error && (
          <div className="mx-3 my-2 rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <AiChatInput
        onSend={(msg) => void sendMessage(msg)}
        onCancel={() => void cancelStream()}
        isStreaming={isStreaming}
      />
    </div>
  );
}
