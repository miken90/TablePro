import React, { useState, useCallback } from "react";
import { Eye, Copy, X } from "lucide-react";
import type { RowChange } from "../../stores/changeStore";

interface SqlPreviewPopoverProps {
  changes: Record<number, RowChange>;
  tableName: string;
  schema: string | null | undefined;
  columns: string[];
  primaryKeys: string[];
  rows?: (string | null)[][];
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

function escapeValue(val: string | null): string {
  if (val === null) return "NULL";
  // numeric-like values (int, float, scientific notation)
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val)) return val;
  return `'${val.replace(/'/g, "''")}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualifiedTable(table: string, schema: string | null | undefined): string {
  if (schema) return `${quoteIdent(schema)}.${quoteIdent(table)}`;
  return quoteIdent(table);
}

export function generatePreviewSql(
  changes: Record<number, RowChange>,
  tableName: string,
  schema: string | null | undefined,
  columns: string[],
  primaryKeys: string[],
  rows?: (string | null)[][],
): string {
  const table = qualifiedTable(tableName, schema);
  const statements: string[] = [];
  // Fall back to all columns when no PKs detected
  const whereKeys = primaryKeys.length > 0 ? primaryKeys : columns;

  for (const change of Object.values(changes)) {
    // Use actual result rows when change.originalRow is empty (typical for updates)
    const origRow = change.originalRow.length > 0
      ? change.originalRow
      : (rows?.[change.rowIndex] ?? []);

    if (change.type === "insert") {
      const changedCells = change.cellChanges.filter(cc => cc.newValue !== undefined);
      if (changedCells.length === 0) continue;
      const cols = changedCells.map(cc => quoteIdent(cc.columnName)).join(", ");
      const vals = changedCells.map(cc => escapeValue(cc.newValue ?? null)).join(", ");
      statements.push(`INSERT INTO ${table} (${cols}) VALUES (${vals})`);
    } else if (change.type === "update") {
      if (change.cellChanges.length === 0) continue;
      const setCols = change.cellChanges
        .map(cc => `${quoteIdent(cc.columnName)}=${escapeValue(cc.newValue ?? null)}`)
        .join(", ");
      const whereParts = whereKeys
        .map(pk => {
          const colIdx = columns.indexOf(pk);
          const val = colIdx >= 0 ? origRow[colIdx] ?? null : null;
          return `${quoteIdent(pk)}=${escapeValue(val)}`;
        })
        .join(" AND ");
      if (!whereParts) continue;
      statements.push(`UPDATE ${table} SET ${setCols} WHERE ${whereParts}`);
    } else if (change.type === "delete") {
      const whereParts = whereKeys
        .map(pk => {
          const colIdx = columns.indexOf(pk);
          const val = colIdx >= 0 ? origRow[colIdx] ?? null : null;
          return `${quoteIdent(pk)}=${escapeValue(val)}`;
        })
        .join(" AND ");
      if (!whereParts) continue;
      statements.push(`DELETE FROM ${table} WHERE ${whereParts}`);
    }
  }

  if (statements.length === 0) return "-- No changes to preview";
  return `BEGIN;\n${statements.join(";\n")};\nCOMMIT;`;
}

export function SqlPreviewButton({
  changes,
  tableName,
  schema,
  columns,
  primaryKeys,
  rows,
}: Omit<SqlPreviewPopoverProps, "anchorEl" | "onClose">) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  const sql = generatePreviewSql(changes, tableName, schema, columns, primaryKeys, rows);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sql]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Preview SQL"
        className="flex items-center gap-1 border border-zinc-300 px-2 py-0.5 rounded text-xs dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
      >
        <Eye size={12} />
        SQL
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 z-50 w-[520px] max-w-[90vw] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">SQL Preview</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Copy size={11} />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={13} />
              </button>
            </div>
          </div>
          <pre className="p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 overflow-auto max-h-60 whitespace-pre-wrap break-all">
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}
