import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Download, FileText, Braces, Database } from "lucide-react";
import type { ExportFormat, ExportOptions } from "../../types/export";

interface ExportDialogProps {
  connectionId: string;
  query: string;
  tableName?: string;
  dbType?: string;
  onClose: () => void;
}

export function ExportDialog({
  connectionId,
  query,
  tableName,
  dbType,
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [filePath, setFilePath] = useState("");
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [delimiter, setDelimiter] = useState(",");
  const [pretty, setPretty] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatOptions: { value: ExportFormat; label: string; icon: React.ReactNode }[] = [
    { value: "csv", label: "CSV", icon: <FileText size={14} /> },
    { value: "json", label: "JSON", icon: <Braces size={14} /> },
    { value: "sql", label: "SQL", icon: <Database size={14} /> },
  ];

  const getDefaultExtension = (fmt: ExportFormat) => {
    switch (fmt) {
      case "csv": return ".csv";
      case "json": return ".json";
      case "sql": return ".sql";
      default: return ".txt";
    }
  };

  const handleExport = async () => {
    if (!filePath.trim()) {
      setError("Please enter a file path");
      return;
    }

    setExporting(true);
    setError(null);
    setResult(null);

    const options: ExportOptions = {
      format,
      file_path: filePath,
      table_name: tableName ?? null,
      include_headers: includeHeaders,
      delimiter: format === "csv" ? delimiter : null,
      pretty: format === "json" ? pretty : null,
      db_type: format === "sql" ? (dbType ?? null) : null,
    };

    try {
      const path = await invoke<string>("export_data", {
        connection_id: connectionId,
        query,
        options,
      });
      setResult(`Exported to ${path}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Export Data</h2>
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
              {formatOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFormat(opt.value);
                    if (filePath) {
                      const base = filePath.replace(/\.[^.]+$/, "");
                      setFilePath(base + getDefaultExtension(opt.value));
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition ${
                    format === opt.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
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
              placeholder={`C:\\Users\\...\\export${getDefaultExtension(format)}`}
              className="w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>

          {/* CSV options */}
          {format === "csv" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include-headers"
                  checked={includeHeaders}
                  onChange={(e) => setIncludeHeaders(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                <label htmlFor="include-headers" className="text-xs text-zinc-500 dark:text-zinc-400">
                  Include headers
                </label>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Delimiter
                </label>
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  <option value=",">Comma (,)</option>
                  <option value="	">Tab (\t)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
            </div>
          )}

          {/* JSON options */}
          {format === "json" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pretty-json"
                checked={pretty}
                onChange={(e) => setPretty(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <label htmlFor="pretty-json" className="text-xs text-zinc-500 dark:text-zinc-400">
                Pretty print
              </label>
            </div>
          )}

          {/* SQL options */}
          {format === "sql" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Table Name
              </label>
              <input
                type="text"
                value={tableName ?? ""}
                disabled
                className="w-full rounded-md border border-zinc-200 bg-zinc-100/50 px-3 py-1.5 text-sm text-zinc-500 outline-none dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
                placeholder="Table name for INSERT statements"
              />
            </div>
          )}

          {/* Result/Error */}
          {result && (
            <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
              {result}
            </div>
          )}
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
            onClick={handleExport}
            disabled={exporting || !filePath.trim()}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Download size={12} />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
