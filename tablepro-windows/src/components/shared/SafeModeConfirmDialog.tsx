import { useState } from "react";
import { AlertTriangle, ShieldOff } from "lucide-react";

export interface SafeModeConfirmDialogProps {
  open: boolean;
  level: number;
  sql: string;
  onConfirm: (tableName?: string) => void;
  onCancel: () => void;
}

const LEVEL_NAMES: Record<number, string> = {
  0: "Off",
  1: "Silent",
  2: "Alert",
  3: "Alert+",
  4: "Safe Mode",
  5: "Read-Only",
};

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  destructive: "This query contains destructive operations (DELETE, DROP, TRUNCATE, ALTER).",
  dml_ddl: "This query modifies data or database structure (INSERT, UPDATE, DELETE, DDL).",
  safe_mode: "This query modifies data. Type the target table name to confirm.",
  read_only: "Write queries are blocked in Read-Only mode.",
};

/** Extract first table name from SQL for level-4 hint */
function extractTableHint(sql: string): string {
  const m =
    /\b(?:FROM|INTO|UPDATE|TABLE|DROP\s+TABLE)\s+["'`]?(\w+)["'`]?/i.exec(sql);
  return m?.[1] ?? "";
}

export function SafeModeConfirmDialog({
  open,
  level,
  sql,
  onConfirm,
  onCancel,
}: SafeModeConfirmDialogProps) {
  const [tableInput, setTableInput] = useState("");

  if (!open) return null;

  const levelName = LEVEL_NAMES[level] ?? `Level ${level}`;
  const isReadOnly = level === 5;
  const requiresTableInput = level === 4;
  const sqlPreview = sql.length > 200 ? sql.slice(0, 200) + "…" : sql;
  const tableHint = requiresTableInput ? extractTableHint(sql) : "";
  const canConfirm = !requiresTableInput || (tableHint ? tableInput.trim() === tableHint : tableInput.trim().length > 0);

  const handleConfirm = () => {
    setTableInput("");
    onConfirm(requiresTableInput ? tableInput.trim() : undefined);
  };

  const handleCancel = () => {
    setTableInput("");
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleCancel}
    >
      <div
        className="relative w-[460px] rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          {isReadOnly ? (
            <ShieldOff size={22} className="text-red-400 flex-shrink-0" />
          ) : (
            <AlertTriangle size={22} className="text-orange-400 flex-shrink-0" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {isReadOnly ? "Read-Only Mode" : "Confirm Query"}
            </h2>
            <span className="text-xs text-zinc-400">Safe Mode: {levelName}</span>
          </div>
        </div>

        {/* Description */}
        <p className="mb-3 text-xs text-zinc-300">
          {LEVEL_DESCRIPTIONS[
            isReadOnly
              ? "read_only"
              : level === 4
              ? "safe_mode"
              : level === 3
              ? "dml_ddl"
              : "destructive"
          ] ?? "Confirm before executing."}
        </p>

        {/* SQL preview */}
        <pre className="mb-4 max-h-24 overflow-auto rounded bg-zinc-800 p-2 text-xs text-zinc-300 whitespace-pre-wrap break-words">
          {sqlPreview}
        </pre>

        {/* Level 4: table name input */}
        {requiresTableInput && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-zinc-400">
              Type table name{tableHint ? ` "${tableHint}"` : ""} to confirm:
            </label>
            <input
              type="text"
              value={tableInput}
              autoFocus
              onChange={(e) => setTableInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) handleConfirm();
                if (e.key === "Escape") handleCancel();
              }}
              placeholder={tableHint || "table name"}
              className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-orange-500 focus:outline-none"
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          {!isReadOnly && (
            <button
              onClick={handleCancel}
              className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
          )}
          <button
            onClick={isReadOnly ? handleCancel : handleConfirm}
            disabled={!isReadOnly && !canConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              isReadOnly
                ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                : "bg-orange-600 text-white hover:bg-orange-700"
            }`}
          >
            {isReadOnly ? "OK" : "Run Anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
