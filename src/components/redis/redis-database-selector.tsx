import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";

/**
 * Redis database selector — dropdown in sidebar header for switching
 * between Redis databases (db0-db15). Triggers SELECT N on the backend.
 */
export function RedisDatabaseSelector() {
  const sessionId = useConnectionStore((s) => {
    const connId = s.selectedConnectionId;
    return connId ? s.sessionIds.get(connId) : undefined;
  });
  const databases = useSchemaStore((s) => s.databases);
  const selectedDatabase = useSchemaStore((s) => s.selectedDatabase);
  const selectDatabase = useSchemaStore((s) => s.selectDatabase);

  if (!sessionId || databases.length === 0) return null;

  return (
    <div className="border-b border-border p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Database
        </span>
        <select
          value={selectedDatabase ?? ""}
          onChange={(e) => {
            if (sessionId) selectDatabase(sessionId, e.target.value || null);
          }}
          aria-label="Select Redis database"
          className="flex-1 rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary"
        >
          <option value="">Select database…</option>
          {databases.map((db) => (
            <option key={db} value={db}>
              {db}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
