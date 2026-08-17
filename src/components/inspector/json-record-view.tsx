import { useCallback, useState } from "react";
import { Copy } from "lucide-react";
import type { ColumnInfo } from "../../types/query";
import { rowToJson } from "../../utils/row-to-json";

interface JsonRecordViewProps {
  columns: ColumnInfo[];
  row: (string | null)[];
}

export function JsonRecordView({ columns, row }: JsonRecordViewProps) {
  const [copied, setCopied] = useState(false);

  const json = rowToJson(columns, row);
  const jsonText = JSON.stringify(json, null, 2);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [jsonText]);

  return (
    <div className="relative flex-1 overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        title="Copy JSON"
      >
        <Copy size={10} />
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
        {jsonText}
      </pre>
    </div>
  );
}
