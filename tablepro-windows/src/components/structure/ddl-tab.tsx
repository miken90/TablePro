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

  const handleCopy = () => {
    navigator.clipboard.writeText(ddl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return <div className="p-3 text-xs text-zinc-400">Loading DDL…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-red-500">{error}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-700">
        <span className="text-[10px] text-zinc-400">CREATE TABLE statement</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          {copied ? (
            <>
              <Check size={11} className="text-green-500" />
              <span className="text-green-500">Copied</span>
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
        <pre className="p-3 font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          {ddl}
        </pre>
      </div>
    </div>
  );
}
