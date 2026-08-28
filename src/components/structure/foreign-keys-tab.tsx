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

  /* eslint-disable react-hooks/set-state-in-effect -- reset loading state on fetch */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return <div className="p-3 text-xs text-text-secondary">Loading foreign keys…</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-state-danger-fg">{error}</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border-subtle bg-surface">
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Name</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Column</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">References</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">On Delete</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">On Update</th>
          </tr>
        </thead>
        <tbody>
          {fks.map((fk) => (
            <tr
              key={fk.name}
              className="border-b border-border-subtle hover:bg-surface-hover hover:text-text-primary"
            >
              <td className="px-3 py-1.5 font-medium text-text-primary">{fk.name}</td>
              <td className="px-3 py-1.5 font-mono text-text-secondary">{fk.column}</td>
              <td className="px-3 py-1.5 font-mono text-text-secondary">
                {fk.referencedTable}.{fk.referencedColumn}
              </td>
              <td className="px-3 py-1.5 text-text-secondary">{fk.onDelete || "—"}</td>
              <td className="px-3 py-1.5 text-text-secondary">{fk.onUpdate || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fks.length === 0 && (
        <div className="p-3 text-xs text-text-secondary">No foreign keys</div>
      )}
    </div>
  );
}
