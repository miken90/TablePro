import { Clock, Play, Settings, Square, Unplug } from "lucide-react";
import { formatTagLabel, tagClassName } from "../connection/connection-tag-picker";
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
      <div className="flex h-9 items-center gap-2 border-b border-border bg-surface px-2">
        {/* Sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          title="Toggle sidebar (Ctrl+Shift+E)"
          aria-label="Toggle sidebar"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Connection status */}
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span className={`h-2 w-2 rounded-full ${statusColors[status] ?? statusColors.disconnected}`} />
          {connection?.color && (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: connection.color }} title={connection.color} />
          )}
          <span className="max-w-[140px] truncate">
            {connection ? `${connection.name} · ${connection.config.database}` : "Not connected"}
          </span>
          {connection?.tag && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tagClassName(connection.tag)}`}>
              {formatTagLabel(connection.tag)}
            </span>
          )}
          {selectedConnectionId && (
            <button
              onClick={() => void handleDisconnect()}
              className="ml-1 rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-accent-red"
              title="Disconnect"
              aria-label="Disconnect from database"
            >
              <Unplug size={12} aria-hidden="true" />
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
            aria-label="Run query"
          >
            <Play size={12} aria-hidden="true" />
            Run
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
            title="Cancel query"
            aria-label="Cancel running query"
          >
            <Square size={12} aria-hidden="true" />
            Stop
          </button>
        )}

        <button
          onClick={onToggleHistory}
          className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          title="Query History (Ctrl+H)"
          aria-label="Toggle query history"
        >
          <Clock size={15} aria-hidden="true" />
        </button>

        <button
          onClick={onOpenSettings}
          className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          title="Settings (Ctrl+,)"
          aria-label="Open settings"
        >
          <Settings size={15} aria-hidden="true" />
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
