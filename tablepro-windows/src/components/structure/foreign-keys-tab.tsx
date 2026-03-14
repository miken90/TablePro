import { useEffect, useState } from "react";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { ForeignKeyInfo } from "../../types/schema";

interface ForeignKeysTabProps {
  sessionId: string;
  tableName: string;
  schema?: string;
}

export function ForeignKeysTab({ sessionId, tableName, schema }: ForeignKeysTabProps) {
  const [fks, setFks] = useState<ForeignKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    commands
      .fetchForeignKeys(sessionId, tableName, schema)
      .then((keys) => {
        setFks(keys);
        setLoading(false);
      })
      .catch((err) => {
        setError(extractErrorMessage(err));
        setLoading(false);
      });
  }, [sessionId, tableName, schema]);

  if (loading) {
    return <div className="p-3 text-xs text-zinc-400">Loading foreign keys…</div>;
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
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">Column</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">References</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">On Delete</th>
            <th className="px-3 py-1.5 text-left font-medium text-zinc-500 dark:text-zinc-400">On Update</th>
          </tr>
        </thead>
        <tbody>
          {fks.map((fk) => (
            <tr
              key={fk.name}
              className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
            >
              <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-200">{fk.name}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-500 dark:text-zinc-400">{fk.column}</td>
              <td className="px-3 py-1.5 font-mono text-zinc-500 dark:text-zinc-400">
                {fk.referencedTable}.{fk.referencedColumn}
              </td>
              <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">{fk.onDelete || "—"}</td>
              <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">{fk.onUpdate || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fks.length === 0 && (
        <div className="p-3 text-xs text-zinc-400">No foreign keys found</div>
      )}
    </div>
  );
}
