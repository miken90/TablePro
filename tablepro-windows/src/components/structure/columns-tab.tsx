import { useEffect, useState } from "react";
import { Key, Link } from "lucide-react";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { ColumnInfo } from "../../types/query";

interface ColumnsTabProps {
  sessionId: string;
  tableName: string;
  schema?: string;
}

export function ColumnsTab({ sessionId, tableName, schema }: ColumnsTabProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    commands
      .fetchColumns(sessionId, tableName, schema)
      .then((cols) => {
        setColumns(cols);
        setLoading(false);
      })
      .catch((err) => {
        setError(extractErrorMessage(err));
        setLoading(false);
      });
  }, [sessionId, tableName, schema]);

  if (loading) {
    return <div className="p-3 text-xs text-zinc-400">Loading columns…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-red-500">{error}</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">#</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Name</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Type</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Nullable</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">PK</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, idx) => (
            <tr
              key={col.name}
              className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
            >
              <td className="px-3 py-1.5 text-zinc-400">{idx + 1}</td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  {col.isPrimaryKey && (
                    <Key size={11} className="shrink-0 text-amber-500" />
                  )}
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{col.name}</span>
                </div>
              </td>
              <td className="px-3 py-1.5 font-mono text-zinc-500 dark:text-zinc-400">{col.typeName}</td>
              <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">
                {col.nullable ? (
                  <span className="text-zinc-400">YES</span>
                ) : (
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">NO</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                {col.isPrimaryKey && <Key size={11} className="text-amber-500" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {columns.length === 0 && (
        <div className="p-3 text-xs text-zinc-400">No columns found</div>
      )}
    </div>
  );
}
