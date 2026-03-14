import { Play, Square, Settings } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useQueryStore } from "../../stores/queryStore";
import { useSettingsStore } from "../../stores/settingsStore";

interface ToolbarProps {
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({ onToggleSidebar, onOpenSettings }: ToolbarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const getStatus = useConnectionStore((s) => s.getStatus);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const { isExecuting, queryText, execute, cancel } = useQueryStore();
  const safeMode = useSettingsStore((s) => s.settings.safeMode);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const connection = selectedConnectionId ? connections.get(selectedConnectionId) : null;
  const status = selectedConnectionId ? getStatus(selectedConnectionId) : "disconnected";

  const statusColors: Record<string, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    error: "bg-red-500",
    disconnected: "bg-zinc-400",
  };

  const handleRun = () => {
    if (!selectedConnectionId || !queryText.trim()) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    void execute(sessionId, queryText);
  };

  const handleStop = () => {
    if (!selectedConnectionId) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    void cancel(sessionId);
  };

  const handleToggleSafeMode = () => {
    void saveSettings({ safeMode: !safeMode });
  };

  return (
    <div className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-2 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        title="Toggle sidebar (Ctrl+Shift+E)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </button>

      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />

      {/* Connection status */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <span className={`h-2 w-2 rounded-full ${statusColors[status] ?? statusColors.disconnected}`} />
        <span className="max-w-[140px] truncate">
          {connection ? `${connection.name} · ${connection.config.database}` : "Not connected"}
        </span>
      </div>

      {/* Safe mode badge */}
      {safeMode && (
        <button
          onClick={handleToggleSafeMode}
          title="Safe mode is ON — click to toggle"
          className="rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:hover:bg-orange-900/60"
        >
          SAFE
        </button>
      )}

      <div className="flex-1" />

      {/* Run / Stop */}
      {!isExecuting ? (
        <button
          onClick={handleRun}
          disabled={!selectedConnectionId || !queryText.trim()}
          className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          title="Run query (Ctrl+Enter)"
        >
          <Play size={12} />
          Run
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
          title="Cancel query"
        >
          <Square size={12} />
          Stop
        </button>
      )}

      <button
        onClick={onOpenSettings}
        className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        title="Settings (Ctrl+,)"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
