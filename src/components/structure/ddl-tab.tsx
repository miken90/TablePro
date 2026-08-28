import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";

interface DdlTabProps {
  sessionId: string;
  tableName: string;
  schema?: string;
}

export function DdlTab({ sessionId, tableName, schema }: DdlTabProps) {
  const [ddl, setDdl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- reset loading state on fetch */
  useEffect(() => {
    setLoading(true);
    setError(null);
    commands
      .fetchDdl(sessionId, tableName, schema)
      .then((text) => {
        setDdl(text);
        setLoading(false);
      })
      .catch((err) => {
        setError(extractErrorMessage(err));
        setLoading(false);
      });
  }, [sessionId, tableName, schema]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCopy = () => {
    navigator.clipboard.writeText(ddl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return <div className="p-3 text-xs text-text-secondary">Loading DDL…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-state-danger-fg">{error}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
        <span className="text-ui-2xs text-text-secondary">CREATE TABLE statement</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-ui-2xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          {copied ? (
            <>
              <Check size={11} className="text-accent-green" />
              <span className="text-accent-green">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              Copy DDL
            </>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="p-3 font-mono text-xs leading-relaxed text-text-primary">
          {ddl}
        </pre>
      </div>
    </div>
  );
}
