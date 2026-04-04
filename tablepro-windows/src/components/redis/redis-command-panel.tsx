import { useState, useCallback } from "react";
import { Play, Loader2 } from "lucide-react";
import { resolveActiveQuerySessionId, useQueryStore } from "../../stores/queryStore";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * Redis CLI command panel — replaces the SQL editor for Redis connections.
 * Provides a single text input for raw Redis commands (GET, SET, SCAN, etc.).
 * Sends raw command text via standard execute_query IPC.
 */
export function RedisCommandPanel() {
  const [command, setCommand] = useState("");
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const execute = useQueryStore((s) => s.execute);
  const safeModeLevel = useSettingsStore((s) => s.settings.safeModeLevel);

  const handleExecute = useCallback(() => {
    const sessionId = resolveActiveQuerySessionId();
    if (!sessionId || !command.trim()) return;
    void execute(sessionId, command.trim(), undefined, safeModeLevel);
  }, [command, execute, safeModeLevel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute],
  );

  const inputCls =
    "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 font-mono outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-medium text-text-muted">Redis CLI</label>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="GET key / SET key value / SCAN 0 MATCH * COUNT 200"
          className={`${inputCls} flex-1`}
          aria-label="Redis command input"
        />
        <button
          onClick={handleExecute}
          disabled={isExecuting || !command.trim()}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          title="Execute command (Enter)"
        >
          {isExecuting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          Execute
        </button>
      </div>
    </div>
  );
}
