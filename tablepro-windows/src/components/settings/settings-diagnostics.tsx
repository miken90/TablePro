import { useCallback, useEffect, useState } from "react";
import { Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import * as commands from "../../ipc/commands";
import type { CrashDumpEntry } from "../../ipc/commands";
import { SettingSection } from "./settings-form";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Phase 3 Item 4 — Crash dump viewer.
 *
 * Lists Rust panic JSON dumps (under `%LOCALAPPDATA%\TablePro\crashes\`) and
 * WER native dumps (under `%LOCALAPPDATA%\CrashDumps\`). Users can delete
 * individual entries; backend refuses paths outside the known directories.
 */
export function SettingsDiagnostics() {
  const [dumps, setDumps] = useState<CrashDumpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await commands.listCrashDumps();
      setDumps(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (path: string) => {
    try {
      await commands.deleteCrashDump(path);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title="Diagnostics" />

      <div className="flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Crash dumps are stored locally in{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] dark:bg-zinc-800">
              %LOCALAPPDATA%\TablePro\crashes\
            </code>{" "}
            and (for WER native dumps){" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] dark:bg-zinc-800">
              %LOCALAPPDATA%\CrashDumps\
            </code>
            . Attach them manually when filing a bug report.
          </p>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && dumps.length === 0 && !error && (
          <p className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No crash dumps. Nothing to worry about.
          </p>
        )}

        {dumps.length > 0 && (
          <ul className="flex flex-col divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
            {dumps.map((d) => (
              <li key={d.path} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        d.kind === "rust"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      }`}
                    >
                      {d.kind === "rust" ? "PANIC" : "WER"}
                    </span>
                    <span className="truncate font-mono text-zinc-800 dark:text-zinc-200">{d.name}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-500 dark:text-zinc-400">{d.path}</p>
                </div>
                <span className="flex-shrink-0 text-zinc-500 dark:text-zinc-400">{fmtSize(d.size)}</span>
                <button
                  onClick={() => void handleDelete(d.path)}
                  className="flex-shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  aria-label={`Delete ${d.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
