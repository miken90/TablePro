import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Play, Trash2, Loader2 } from "lucide-react";
import { useChangeStore } from "../../stores/changes";
import type { ChangeSet } from "../../types/changes";
import type { DatabaseType, ColumnInfo } from "../../types";

interface SaveChangesDialogProps {
  tabId: string;
  table: string;
  dbType: DatabaseType;
  connectionId: string;
  columns: ColumnInfo[];
  rows: (string | null)[][];
  onClose: () => void;
  onSaved: () => void;
}

export function SaveChangesDialog({
  tabId,
  table,
  dbType,
  connectionId,
  columns,
  rows,
  onClose,
  onSaved,
}: SaveChangesDialogProps) {
  const tabChanges = useChangeStore((s) => s.getTabChanges(tabId));
  const discardChanges = useChangeStore((s) => s.discardChanges);
  const [sqlPreview, setSqlPreview] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const pkColumns = columns.filter((c) => c.is_primary_key).map((c) => c.name);

  function buildChangeSet(): ChangeSet {
    const changes = tabChanges;
    if (!changes) {
      return {
        updates: [],
        inserts: [],
        deletes: [],
        primary_key_columns: pkColumns,
        primary_key_values: {},
      };
    }

    const pkValues: Record<number, Record<string, string>> = {};
    for (const update of changes.updates) {
      if (!pkValues[update.rowIndex]) {
        pkValues[update.rowIndex] = {};
        for (const pkCol of pkColumns) {
          const colIdx = columns.findIndex((c) => c.name === pkCol);
          if (colIdx >= 0 && rows[update.rowIndex]) {
            pkValues[update.rowIndex][pkCol] = rows[update.rowIndex][colIdx] ?? "";
          }
        }
      }
    }

    const deleteEntries = Array.from(changes.deletes).map((rowIdx) => {
      const vals: Record<string, string> = {};
      for (const pkCol of pkColumns) {
        const colIdx = columns.findIndex((c) => c.name === pkCol);
        if (colIdx >= 0 && rows[rowIdx]) {
          vals[pkCol] = rows[rowIdx][colIdx] ?? "";
        }
      }
      return { primary_key_values: vals };
    });

    return {
      updates: changes.updates.map((u) => ({
        row_index: u.rowIndex,
        column: u.column,
        original_value: u.originalValue,
        new_value: u.newValue,
      })),
      inserts: changes.inserts.map((i) => ({ values: i.values })),
      deletes: deleteEntries,
      primary_key_columns: pkColumns,
      primary_key_values: pkValues,
    };
  }

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const changeSet = buildChangeSet();
      const sql = await invoke<string[]>("generate_change_sql", {
        table,
        dbType,
        changes: changeSet,
      });
      setSqlPreview(sql);
    } catch (e) {
      setError(String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    try {
      const changeSet = buildChangeSet();
      const sql = await invoke<string[]>("generate_change_sql", {
        table,
        dbType,
        changes: changeSet,
      });

      if (sql.length === 0) {
        setError("No changes to execute");
        return;
      }

      await invoke("execute_changes", {
        connectionId,
        statements: sql,
      });

      setSuccess(true);
      discardChanges(tabId);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 500);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    discardChanges(tabId);
    onClose();
  };

  const changeCount = tabChanges
    ? tabChanges.updates.length + tabChanges.inserts.length + tabChanges.deletes.size
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[80vh] w-[700px] overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Pending Changes ({changeCount})
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-auto p-4">
          {tabChanges && tabChanges.updates.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium text-amber-500 dark:text-amber-400">
                Updates ({tabChanges.updates.length})
              </h4>
              {tabChanges.updates.map((u, i) => (
                <div key={i} className="mb-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Row {u.rowIndex}: {u.column} = {u.newValue ?? "NULL"}
                  <span className="text-zinc-400 dark:text-zinc-600"> (was: {u.originalValue ?? "NULL"})</span>
                </div>
              ))}
            </div>
          )}

          {tabChanges && tabChanges.inserts.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium text-green-500 dark:text-green-400">
                Inserts ({tabChanges.inserts.length})
              </h4>
              {tabChanges.inserts.map((ins, i) => (
                <div key={i} className="mb-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {Object.entries(ins.values)
                    .map(([k, v]) => `${k}=${v ?? "NULL"}`)
                    .join(", ")}
                </div>
              ))}
            </div>
          )}

          {tabChanges && tabChanges.deletes.size > 0 && (
            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium text-red-500 dark:text-red-400">
                Deletes ({tabChanges.deletes.size})
              </h4>
              {Array.from(tabChanges.deletes).map((idx) => (
                <div key={idx} className="mb-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Row {idx}
                </div>
              ))}
            </div>
          )}

          {sqlPreview.length > 0 && (
            <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
              <h4 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">SQL Preview</h4>
              <pre className="overflow-auto text-xs text-zinc-600 dark:text-zinc-400">
                {sqlPreview.map((s) => `${s};`).join("\n")}
              </pre>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-600 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400">
              Changes applied successfully
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-red-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
          >
            <Trash2 size={12} />
            Discard All
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {previewLoading ? "Loading..." : "Preview SQL"}
            </button>
            <button
              onClick={handleExecute}
              disabled={loading || changeCount === 0}
              className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-500 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Execute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
