import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Upload, FileText, Database } from "lucide-react";
import type { ImportResult } from "../../types/export";

type ImportFormat = "sql" | "csv";

interface ImportDialogProps {
  connectionId: string;
  dbType?: string;
  onClose: () => void;
  onComplete?: () => void;
}

export function ImportDialog({
  connectionId,
  dbType,
  onClose,
  onComplete,
}: ImportDialogProps) {
  const [format, setFormat] = useState<ImportFormat>("sql");
  const [filePath, setFilePath] = useState("");
  const [tableName, setTableName] = useState("");
  const [hasHeaders, setHasHeaders] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!filePath.trim()) {
      setError("Please enter a file path");
      return;
    }

    if (format === "csv" && !tableName.trim()) {
      setError("Please enter a table name for CSV import");
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      let res: ImportResult;
      if (format === "sql") {
        res = await invoke<ImportResult>("import_sql", {
          connection_id: connectionId,
          file_path: filePath,
        });
      } else {
        res = await invoke<ImportResult>("import_csv", {
          connection_id: connectionId,
          file_path: filePath,
          table_name: tableName,
          has_headers: hasHeaders,
          db_type: dbType ?? "mysql",
        });
      }
      setResult(res);
      if (res.failed === 0) {
        onComplete?.();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Import Data</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {/* Format picker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("sql")}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition ${
                  format === "sql"
                    ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                <Database size={14} />
                SQL
              </button>
              <button
                onClick={() => setFormat("csv")}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition ${
                  format === "csv"
                    ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                <FileText size={14} />
                CSV
              </button>
            </div>
          </div>

          {/* File path */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              File Path
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder={`C:\\Users\\...\\data.${format}`}
              className="w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>

          {/* CSV-specific options */}
          {format === "csv" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Target Table
                </label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Table name to insert into"
                  className="w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="has-headers"
                  checked={hasHeaders}
                  onChange={(e) => setHasHeaders(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                <label htmlFor="has-headers" className="text-xs text-zinc-500 dark:text-zinc-400">
                  First row contains headers
                </label>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`rounded-md px-3 py-2 text-xs ${
                result.failed > 0
                  ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                  : "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              }`}
            >
              <p>
                {result.successful}/{result.total_statements} statements executed
                successfully
              </p>
              {result.failed > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-red-500 dark:text-red-400">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !filePath.trim()}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Upload size={12} />
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
