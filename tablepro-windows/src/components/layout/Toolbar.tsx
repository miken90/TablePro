import { Clock, Settings, Shield, Unplug } from "lucide-react";
import { formatTagLabel, tagClassName } from "../connection/connection-tag-picker";
import { useConnectionStore } from "../../stores/connectionStore";
import { useQueryStore } from "../../stores/queryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useEditorStore } from "../../stores/editorStore";
import { useEditorViewRef } from "../../contexts/editor-view-context";
import { statementAtCursor } from "../../editor/statement-scanner";
import { SafeModeConfirmDialog } from "../shared/SafeModeConfirmDialog";
import { RunSplitButton } from "./run-split-button";

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
  const { isExecuting, queryText, result: queryResult, execute, cancel, pendingSafeCheck, confirmSafeCheck, cancelSafeCheck } = useQueryStore();
  const safeModeLevel = useSettingsStore((s) => s.settings.safeModeLevel);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const clearSchema = useSchemaStore((s) => s.clearSchema);
  const editorViewRef = useEditorViewRef();

  const connection = selectedConnectionId ? connections.get(selectedConnectionId) : null;
  const status = selectedConnectionId ? getStatus(selectedConnectionId) : "disconnected";

  const statusColors: Record<string, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    error: "bg-red-500",
    disconnected: "bg-zinc-400",
  };

  /** Extract the current statement at cursor from the editor, or fall back to full queryText. */
  const getCurrentStatement = (): string => {
    const view = editorViewRef.current;
    if (!view) return queryText;
    const doc = view.state.doc.toString();
    const cursor = view.state.selection.main.head;
    const stmt = statementAtCursor(doc, cursor);
    return stmt.trim() || queryText;
  };

  const handleRun = () => {
    if (!selectedConnectionId || !queryText.trim()) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    onRunQuery?.();
    const stmt = getCurrentStatement();
    if (stmt.trim()) void execute(sessionId, stmt, undefined, safeModeLevel);
  };

  const handleStop = () => {
    if (!selectedConnectionId) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    void cancel(sessionId);
  };

  const handleRunAll = () => {
    if (!selectedConnectionId || !queryText.trim()) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    onRunQuery?.();
    // Execute all text as-is (all statements)
    void execute(sessionId, queryText.trim(), undefined, safeModeLevel);
  };

  const handleExplain = () => {
    if (!selectedConnectionId || !queryText.trim()) return;
    const sessionId = getSessionId(selectedConnectionId);
    if (!sessionId) return;
    const conn = connections.get(selectedConnectionId);
    const dbType = conn?.config?.dbType?.toLowerCase();
    // Use current statement only (not all editor text)
    const stmt = getCurrentStatement();
    if (!stmt.trim()) return;
    // Prefix with engine-appropriate EXPLAIN
    let explainSql: string;
    if (dbType === "mysql") {
      explainSql = `EXPLAIN ${stmt}`;
    } else {
      explainSql = `EXPLAIN ANALYZE ${stmt}`;
    }
    onRunQuery?.();
    void execute(sessionId, explainSql, undefined, safeModeLevel);
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
            title={`Safe Mode: ${levelName} — click to cycle (Off → Alert → Read-Only)`}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${levelColor}`}
          >
            <Shield size={12} aria-hidden="true" />
            {levelName}
          </button>
        )}

        <div className="flex-1" />

        {/* Run split-button */}
        <RunSplitButton
          onRun={handleRun}
          onRunAll={handleRunAll}
          onExplain={handleExplain}
          onExportCsv={() => {/* Export dialog handled at ResultPanel level */}}
          onCancel={handleStop}
          isExecuting={isExecuting}
          disabled={!selectedConnectionId || !queryText.trim()}
          dbType={connection?.config?.dbType}
          hasResult={!!queryResult}
        />

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
