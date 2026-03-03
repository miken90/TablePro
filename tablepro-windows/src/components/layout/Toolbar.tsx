import { useAppStore } from "../../stores/app";
import { useSidebarStore } from "../../stores/sidebar";
import { CONNECTION_COLORS, DB_TYPE_ICONS } from "../../types";
import { Play, LogOut, Download, Upload, Bot } from "lucide-react";
import { disconnectFromDatabase } from "../../utils/api";
import { useAIStore } from "../../stores/ai";

interface ToolbarProps {
  onRunQuery: () => void;
  viewMode: "data" | "structure";
  onViewModeChange: (mode: "data" | "structure") => void;
  onExport?: () => void;
  onImport?: () => void;
}

export function Toolbar({ onRunQuery, viewMode, onViewModeChange, onExport, onImport }: ToolbarProps) {
  const connections = useAppStore((s) => s.connections);
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const serverVersion = useAppStore((s) => s.serverVersion);
  const setView = useAppStore((s) => s.setView);
  const setActiveConnectionId = useAppStore((s) => s.setActiveConnectionId);
  const databases = useSidebarStore((s) => s.databases);
  const activeDatabase = useSidebarStore((s) => s.activeDatabase);
  const setActiveDatabase = useSidebarStore((s) => s.setActiveDatabase);
  const toggleAIPanel = useAIStore((s) => s.togglePanel);
  const aiPanelOpen = useAIStore((s) => s.isPanelOpen);

  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const colorHex = activeConn
    ? CONNECTION_COLORS.find((c) => c.value === activeConn.color)?.hex
    : undefined;

  const handleDisconnect = async () => {
    if (activeConnectionId) {
      await disconnectFromDatabase(activeConnectionId);
      setActiveConnectionId(null);
      setView("welcome");
    }
  };

  return (
    <div className="flex h-10 items-center gap-2 border-b border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Connection badge */}
      {activeConn && (
        <div className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          {colorHex && colorHex !== "transparent" && (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorHex }} />
          )}
          <span className="text-xs">{DB_TYPE_ICONS[activeConn.dbType]}</span>
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{activeConn.name}</span>
          {serverVersion && (
            <span className="text-xs text-zinc-500">{serverVersion}</span>
          )}
        </div>
      )}

      {/* Database picker */}
      {databases.length > 1 && (
        <select
          value={activeDatabase ?? ""}
          onChange={(e) => setActiveDatabase(e.target.value)}
          className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {databases.map((db) => (
            <option key={db} value={db}>
              {db}
            </option>
          ))}
        </select>
      )}

      <div className="flex-1" />

      {/* View mode toggle */}
      <div className="flex rounded-md border border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => onViewModeChange("data")}
          className={`px-2.5 py-1 text-xs transition ${
            viewMode === "data"
              ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          Data
        </button>
        <button
          onClick={() => onViewModeChange("structure")}
          className={`px-2.5 py-1 text-xs transition ${
            viewMode === "structure"
              ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          Structure
        </button>
      </div>

      {/* Export/Import */}
      {onExport && (
        <button
          onClick={onExport}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Export"
        >
          <Download size={14} />
          Export
        </button>
      )}
      {onImport && (
        <button
          onClick={onImport}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Import"
        >
          <Upload size={14} />
          Import
        </button>
      )}

      {/* Run button */}
      <button
        onClick={onRunQuery}
        className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-green-500"
      >
        <Play size={12} />
        Run
      </button>

      {/* AI Chat toggle */}
      <button
        onClick={toggleAIPanel}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${
          aiPanelOpen
            ? "bg-blue-600 text-white"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        }`}
        title="AI Chat"
      >
        <Bot size={14} />
      </button>

      {/* Disconnect */}
      <button
        onClick={handleDisconnect}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        title="Disconnect"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
