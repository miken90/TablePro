import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Trash2, Copy, Code } from "lucide-react";
import { useAIStore } from "../../stores/ai";
import { useAppStore } from "../../stores/app";
import { AI_PROVIDERS } from "../../types/ai";
import type { ChatMessage } from "../../types/ai";

function extractCodeBlocks(
  content: string,
): { type: "text" | "code"; content: string; language?: string }[] {
  const parts: { type: "text" | "code"; content: string; language?: string }[] =
    [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      content: match[2].trim(),
      language: match[1] || "sql",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  return parts;
}

function CodeBlock({
  code,
  language,
  onApply,
}: {
  code: string;
  language: string;
  onApply: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="group relative my-2 rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1 dark:border-zinc-700">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {language}
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleCopy}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Copy"
          >
            <Copy size={12} />
          </button>
          {(language === "sql" || language === "") && (
            <button
              onClick={() => onApply(code)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-blue-500 transition hover:bg-zinc-200 dark:text-blue-400 dark:hover:bg-zinc-800"
              title="Apply to Editor"
            >
              <Code size={12} />
              Apply
            </button>
          )}
        </div>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
        <code>{code}</code>
      </pre>
      {copied && (
        <div className="absolute right-2 top-8 rounded bg-zinc-200 px-2 py-1 text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
          Copied!
        </div>
      )}
    </div>
  );
}

function ChatMessageBubble({
  message,
  onApplyCode,
}: {
  message: ChatMessage;
  onApplyCode: (code: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const parts = extractCodeBlocks(message.content);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] text-sm text-zinc-800 dark:text-zinc-200">
        {parts.map((part, i) =>
          part.type === "code" ? (
            <CodeBlock
              key={i}
              code={part.content}
              language={part.language ?? "sql"}
              onApply={onApplyCode}
            />
          ) : (
            <span key={i} className="whitespace-pre-wrap">
              {part.content}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

interface AIChatPanelProps {
  onApplyToEditor?: (sql: string) => void;
}

export function AIChatPanel({ onApplyToEditor }: AIChatPanelProps) {
  const messages = useAIStore((s) => s.messages);
  const isLoading = useAIStore((s) => s.isLoading);
  const selectedProvider = useAIStore((s) => s.selectedProvider);
  const selectedModel = useAIStore((s) => s.selectedModel);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const clearChat = useAIStore((s) => s.clearChat);
  const setProvider = useAIStore((s) => s.setProvider);
  const setModel = useAIStore((s) => s.setModel);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed, activeConnectionId);
  }, [input, isLoading, sendMessage, activeConnectionId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleApplyCode = useCallback(
    (code: string) => {
      onApplyToEditor?.(code);
    },
    [onApplyToEditor],
  );

  const providerConfig = AI_PROVIDERS.find((p) => p.value === selectedProvider);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">AI Chat</span>
        <div className="flex-1" />
        <select
          value={selectedProvider}
          onChange={(e) => setProvider(e.target.value as typeof selectedProvider)}
          className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={selectedModel}
          onChange={(e) => setModel(e.target.value)}
          className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {providerConfig?.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={clearChat}
          className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Clear chat"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-zinc-500">
                Ask AI to help with SQL queries
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
                Schema context is auto-included when connected
              </p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessageBubble
            key={i}
            message={msg}
            onApplyCode={handleApplyCode}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your database…"
            rows={1}
            className="flex-1 resize-none rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder:text-zinc-600"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="rounded-md bg-blue-600 p-2 text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
