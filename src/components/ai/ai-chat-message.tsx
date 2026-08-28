import { useMemo } from "react";
import { User, Bot, RefreshCw } from "lucide-react";
import { AiCodeBlock } from "./ai-code-block";
import { renderSanitizedMarkdown } from "./ai-markdown-sanitizer";
import type { ChatMessage } from "../../stores/aiChatStore";

interface AiChatMessageProps {
  message: ChatMessage;
  isLast?: boolean;
  isStreaming?: boolean;
  onInsertToEditor?: (code: string) => void;
  onRetry?: () => void;
}

/**
 * Renders a chat message. User messages are plain text.
 * Assistant messages are rendered as markdown with code blocks extracted.
 */
export function AiChatMessage({ message, isLast, isStreaming, onInsertToEditor, onRetry }: AiChatMessageProps) {
  const isUser = message.role === "user";

  // Parse assistant markdown, extract code blocks for custom rendering
  const renderedContent = useMemo(() => {
    if (isUser) return null;

    const content = message.content;
    if (!content) return null;

    // Split content by code blocks: ```lang\ncode\n```
    const parts: Array<{ type: "text" | "code"; content: string; language?: string }> = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: "code", content: match[2], language: match[1] || undefined });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", content: content.slice(lastIndex) });
    }

    return parts;
  }, [message.content, isUser]);

  if (isUser) {
    return (
      <div className="flex gap-2 px-3 py-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-blue/20 text-accent-blue">
          <User size={12} aria-hidden="true" />
        </div>
        <div className="flex-1 pt-0.5">
          <p className="whitespace-pre-wrap text-xs text-text-primary">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 bg-surface-muted/50 px-3 py-2">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-500">
        <Bot size={12} aria-hidden="true" />
      </div>
      <div className="flex-1 overflow-hidden pt-0.5">
        {!renderedContent || renderedContent.length === 0 ? (
          <span className="inline-flex gap-1 text-xs text-text-muted">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse [animation-delay:200ms]">●</span>
            <span className="animate-pulse [animation-delay:400ms]">●</span>
          </span>
        ) : (
          renderedContent.map((part, i) =>
            part.type === "code" ? (
              <AiCodeBlock
                key={i}
                code={part.content}
                language={part.language}
                onInsertToEditor={onInsertToEditor}
              />
            ) : (
              <div
                key={i}
                className="ai-markdown prose prose-xs dark:prose-invert max-w-none text-xs text-text-primary [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_code]:rounded [&_code]:bg-surface-base [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px]"
                dangerouslySetInnerHTML={{
                  __html: renderSanitizedMarkdown(part.content),
                }}
              />
            ),
          )
        )}
        {/* Token usage + retry button */}
        {isLast && !isStreaming && message.content && (
          <div className="mt-1 flex items-center gap-2">
            {message.tokenCount != null && (
              <span className="text-[10px] text-text-secondary">
                {message.tokenCount} tokens
              </span>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-secondary transition hover:bg-surface hover:text-text-primary"
                title="Regenerate response"
                aria-label="Regenerate AI response"
              >
                <RefreshCw size={10} aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
