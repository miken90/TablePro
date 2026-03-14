import { useEffect, useState } from "react";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { IndexInfo } from "../../types/schema";

interface IndexesTabProps {
  sessionId: string;
  tableName: string;
  schema?: string;
}

export function IndexesTab({ sessionId, tableName, schema }: IndexesTabProps) {
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    commands
      .fetchIndexes(sessionId, tableName, schema)
      .then((idxs) => {
        setIndexes(idxs);
        setLoading(false);
      })
      .catch((err) => {
        setError(extractErrorMessage(err));
        setLoading(false);
      });
  }, [sessionId, tableName, schema]);

  if (loading) {
    return <div className="p-3 text-xs text-zinc-400">Loading indexes…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-red-500">{error}</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Name</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Columns</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Unique</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Type</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx) => (
            <tr
              key={idx.name}
              className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
            >
              <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-200">{idx.name}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-500 dark:text-zinc-400">
                {idx.columns.join(", ")}
              </td>
              <td className="px-3 py-1.5">
                {idx.isUnique ? (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                    YES
                  </span>
                ) : (
                  <span className="text-zinc-400">NO</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">{idx.indexType}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {indexes.length === 0 && (
        <div className="p-3 text-xs text-zinc-400">No indexes found</div>
      )}
    </div>
  );
}
