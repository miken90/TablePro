import { useAppStore } from "../../stores/app";
import { VimModeIndicator } from "../editor/VimModeIndicator";

interface StatusBarProps {
  rowCount?: number | null;
  executionTime?: number | null;
  selectedRows?: number;
  vimMode?: "NORMAL" | "INSERT" | "VISUAL" | "REPLACE";
  vimEnabled?: boolean;
}

export function StatusBar({ rowCount, executionTime, selectedRows, vimMode, vimEnabled }: StatusBarProps) {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);

  return (
    <div className="flex h-6 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        {activeConnectionId && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        )}
        {vimMode && vimEnabled && (
          <VimModeIndicator mode={vimMode} enabled={vimEnabled} />
        )}
      </div>
      <div className="flex items-center gap-3">
        {selectedRows != null && selectedRows > 0 && (
          <span>{selectedRows} selected</span>
        )}
        {rowCount != null && <span>{rowCount.toLocaleString()} rows</span>}
        {executionTime != null && <span>{executionTime.toFixed(1)} ms</span>}
      </div>
    </div>
  );
}
