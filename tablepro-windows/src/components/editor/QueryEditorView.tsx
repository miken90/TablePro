import { useState, useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { SQLEditor } from "./SQLEditor";
import { DataGrid } from "../grid/DataGrid";
import { HistoryPanel } from "../history/HistoryPanel";
import { useTabStore } from "../../stores/tabs";
import { useAppStore } from "../../stores/app";
import { useHistoryStore } from "../../stores/history";
import { executeQuery } from "../../utils/api";
import { format as formatSQL } from "sql-formatter";
import { Play, Wand2, History } from "lucide-react";
import type { QueryResult } from "../../types";

interface QueryEditorViewProps {
  tabId: string;
  onQueryResult?: (result: QueryResult) => void;
  onVimModeChange?: (mode: "NORMAL" | "INSERT" | "VISUAL" | "REPLACE") => void;
}

export function QueryEditorView({ tabId, onQueryResult, onVimModeChange }: QueryEditorViewProps) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId));
  const updateTabQuery = useTabStore((s) => s.updateTabQuery);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const connections = useAppStore((s) => s.connections);
  const saveHistory = useHistoryStore((s) => s.saveQuery);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleExecute = useCallback(
    async (query: string) => {
      if (!activeConnectionId || !query.trim()) return;
      setExecuting(true);
      setError(null);
      try {
        const res = await executeQuery(activeConnectionId, query);
        setResult(res);
        if (res.error) {
          setError(res.error);
        }
        onQueryResult?.(res);

        const conn = connections.find((c) => c.id === activeConnectionId);
        saveHistory(
          query,
          conn?.database ?? "",
          conn?.name ?? "",
          res.execution_time_ms,
          res.error ? 0 : res.rows.length,
          res.error ? "error" : "success",
        );
      } catch (err) {
        setError(String(err));
        const conn = connections.find((c) => c.id === activeConnectionId);
        saveHistory(query, conn?.database ?? "", conn?.name ?? "", 0, 0, "error");
      } finally {
        setExecuting(false);
      }
    },
    [activeConnectionId, connections, onQueryResult, saveHistory],
  );

  const handleFormat = useCallback(() => {
    if (!tab) return;
    try {
      const formatted = formatSQL(tab.query, { language: "sql", tabWidth: 2 });
      updateTabQuery(tabId, formatted);
    } catch {
      // ignore format errors
    }
  }, [tab, tabId, updateTabQuery]);

  if (!tab) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center gap-1 border-b border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          onClick={() => handleExecute(tab.query)}
          disabled={executing}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-green-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-green-400 dark:hover:bg-zinc-800"
          title="Run (Ctrl+Enter)"
        >
          <Play size={12} />
          {executing ? "Running…" : "Run"}
        </button>
        <button
          onClick={handleFormat}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Format SQL"
        >
          <Wand2 size={12} />
          Format
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            showHistory ? "text-blue-500 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"
          }`}
          title="History"
        >
          <History size={12} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <Group orientation="vertical" className="h-full">
        <Panel defaultSize={40} minSize={15}>
          <SQLEditor
            value={tab.query}
            onChange={(v) => updateTabQuery(tabId, v)}
            onExecute={handleExecute}
            onVimModeChange={onVimModeChange}
          />
        </Panel>

        <Separator className="h-px bg-zinc-200 hover:bg-blue-500 transition-colors dark:bg-zinc-700" />

        <Panel defaultSize={60} minSize={10}>
          <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
            {executing && (
              <div className="flex items-center justify-center p-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Executing query…</p>
              </div>
            )}
            {error && (
              <div className="m-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </div>
            )}
            {result && !error && result.columns.length > 0 && (
              <div className="flex-1">
                <DataGrid result={result} />
              </div>
            )}
            {result && !error && result.columns.length === 0 && (
              <div className="flex items-center justify-center p-4">
                <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                  <p>Query executed successfully</p>
                  <p className="text-xs text-zinc-400 mt-1 dark:text-zinc-500">
                    {result.rows_affected} rows affected · {result.execution_time_ms.toFixed(1)} ms
                  </p>
                </div>
              </div>
            )}
            {!executing && !error && !result && (
              <div className="flex items-center justify-center p-4">
                <p className="text-sm text-zinc-500">
                  Run a query to see results (Ctrl+Enter)
                </p>
              </div>
            )}
          </div>
        </Panel>
      </Group>
        </div>

        {showHistory && (
          <div className="w-72 shrink-0">
            <HistoryPanel
              onSelectQuery={(query) => {
                updateTabQuery(tabId, query);
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
