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

  /* eslint-disable react-hooks/set-state-in-effect -- reset loading state on fetch */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return <div className="p-3 text-xs text-text-secondary">Loading indexes…</div>;
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
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Columns</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Unique</th>
            <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Type</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx) => (
            <tr
              key={idx.name}
              className="border-b border-border-subtle hover:bg-surface-hover hover:text-text-primary"
            >
              <td className="px-3 py-1.5 font-medium text-text-primary">{idx.name}</td>
              <td className="px-3 py-1.5 font-mono text-text-secondary">
                {idx.columns.join(", ")}
              </td>
              <td className="px-3 py-1.5">
                {idx.isUnique ? (
                  <span className="rounded-xs bg-accent-blue-subtle px-xs py-2xs text-ui-2xs font-medium text-accent-blue">
                    YES
                  </span>
                ) : (
                  <span className="text-text-secondary">NO</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-text-secondary">{idx.indexType}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {indexes.length === 0 && (
        <div className="p-3 text-xs text-text-secondary">No indexes on this table</div>
      )}
    </div>
  );
}
