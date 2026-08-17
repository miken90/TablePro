import { useState, useCallback } from "react";
import { Check, Clipboard, ArrowRightToLine } from "lucide-react";

interface AiCodeBlockProps {
  code: string;
  language?: string;
  onInsertToEditor?: (code: string) => void;
}

export function AiCodeBlock({ code, language, onInsertToEditor }: AiCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [code]);

  const isSql = language === "sql" || language === "pgsql" || language === "mysql" || !language;

  return (
    <div className="group relative my-2 rounded-md border border-border-subtle bg-surface-base overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted px-3 py-1">
        <span className="text-[10px] font-medium uppercase text-text-muted">
          {language || "sql"}
        </span>
        <div className="flex items-center gap-1">
          {isSql && onInsertToEditor && (
            <button
              onClick={() => onInsertToEditor(code)}
              className="rounded p-0.5 text-text-muted transition hover:bg-surface hover:text-accent-blue"
              title="Insert to editor"
              aria-label="Insert code into SQL editor"
            >
              <ArrowRightToLine size={12} aria-hidden="true" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="rounded p-0.5 text-text-muted transition hover:bg-surface hover:text-text-primary"
            title="Copy code"
            aria-label="Copy code to clipboard"
          >
            {copied ? (
              <Check size={12} className="text-green-500" aria-hidden="true" />
            ) : (
              <Clipboard size={12} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono text-text-primary">{code}</code>
      </pre>
    </div>
  );
}
