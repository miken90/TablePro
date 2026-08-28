import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";

interface AiChatInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function AiChatInput({ onSend, onCancel, isStreaming, disabled }: AiChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText("");
  }, [text, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without modifiers = send
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSend();
      }
      // Shift+Enter = newline (default behavior)
    },
    [handleSend],
  );

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [text]);

  return (
    <div className="border-t border-border bg-surface px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your database…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-blue disabled:opacity-50"
          aria-label="AI chat input"
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="rounded-md bg-accent-red/10 p-2 text-accent-red transition hover:bg-accent-red/20"
            title="Stop generation"
            aria-label="Stop AI generation"
          >
            <Square size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="rounded-md bg-accent-blue p-2 text-white transition hover:bg-accent-blue/80 disabled:opacity-40"
            title="Send message (Enter)"
            aria-label="Send message"
          >
            <Send size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[10px] text-text-secondary">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
