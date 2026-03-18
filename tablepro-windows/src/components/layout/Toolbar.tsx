import { Play, Square, Settings, Unplug, Clock } from "lucide-react";
import { useConnectionStore } from "../../stores/connectionStore";
import { useQueryStore } from "../../stores/queryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useEditorStore } from "../../stores/editorStore";
import { SafeModeConfirmDialog } from "../shared/SafeModeConfirmDialog";

interface ToolbarProps {
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onToggleHistory?: () => void;
  onRunQuery?: () => void;
}

/** Quick-cycle levels: Off → Alert → Read-Only → Off */
const CYCLE: Record<number, number> = { 0: 2, 2: 5, 5: 0 };
function cycleLevel(current: number): number {
  return CYCLE[current] ?? (current >= 5 ? 0 : current + 1);
}

const LEVEL_NAMES: Record<number, string> = {
  0: "Off",
  1: "Silent",
  2: "Alert",
  3: "Alert+",
  4: "Safe",
  5: "Read-Only",
};

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60",
  1: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60",
  2: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-400 dark:hover:bg-yellow-900/60",
  3: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:hover:bg-orange-900/60",
  4: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:hover:bg-orange-900/60",
  5: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60",
};

export function Toolbar({ onToggleSidebar, onOpenSettings, onToggleHistory, onRunQuery }: ToolbarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const getStatus = useConnectionStore((s) => s.getStatus);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const { isExecuting, queryText, execute, cancel, pendingSafeCheck, confirmSafeCheck, cancelSafeCheck } = useQueryStore();
  const safeModeLevel = useSettingsStore((s) => s.settings.safeModeLevel);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const clearSchema = useSchemaStore((s) => s.clearSchema);

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
    onRunQuery?.();
    void execute(sessionId, queryText, undefined, safeModeLevel);
  };

  const handleStop = () => {
    if (!selectedConnectionId) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    void cancel(sessionId);
  };

  const handleCycleSafeMode = () => {
    void saveSettings({ safeModeLevel: cycleLevel(safeModeLevel) });
  };

  const handleDisconnect = async () => {
    if (!selectedConnectionId) return;
    await disconnect(selectedConnectionId);
    clearSchema();
    // Clear editor tabs so user returns to WelcomeView cleanly
    useEditorStore.setState({ tabs: [], activeTabId: null });
  };

  const levelName = LEVEL_NAMES[safeModeLevel] ?? `L${safeModeLevel}`;
  const levelColor = LEVEL_COLORS[safeModeLevel] ?? LEVEL_COLORS[2];

  return (
    <>
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
          {selectedConnectionId && (
            <button
              onClick={() => void handleDisconnect()}
              className="ml-1 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-700 dark:hover:text-red-400"
              title="Disconnect"
            >
              <Unplug size={12} />
            </button>
          )}
        </div>

        {/* Safe mode badge — shown when level > 0 */}
        {safeModeLevel > 0 && (
          <button
            onClick={handleCycleSafeMode}
            title={`Safe Mode: ${levelName} (click to cycle)`}
            className={`rounded px-2 py-0.5 text-xs font-semibold ${levelColor}`}
          >
            {levelName}
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
          onClick={onToggleHistory}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          title="Query History (Ctrl+H)"
        >
          <Clock size={15} />
        </button>

        <button
          onClick={onOpenSettings}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          title="Settings (Ctrl+,)"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Safe mode confirmation dialog */}
      {pendingSafeCheck && (
        <SafeModeConfirmDialog
          open={true}
          level={pendingSafeCheck.level}
          sql={pendingSafeCheck.sql}
          onConfirm={() => void confirmSafeCheck()}
          onCancel={cancelSafeCheck}
        />
      )}
    </>
  );
}
