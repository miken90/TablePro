import React, { useState, useEffect, useRef } from "react";
import { useSchemaStore } from "../../stores/schemaStore";
import { executeQuery } from "../../ipc/commands";
import { useConnectionStore } from "../../stores/connectionStore";
import { Search, Loader2 } from "lucide-react";
import type { FkRef } from "../../stores/schemaStore";
import type { QueryResult } from "../../types/query";

interface ForeignKeyCellEditorProps {
  sessionId: string;
  fkRef: FkRef;
  value: string | null;
  onCommit: (v: string | null) => void;
  onCancel: () => void;
}

function quoteIdent(name: string, dbType: string): string {
  const clean = name.replace(/`/g, "").replace(/"/g, "").replace(/\[/g, "").replace(/\]/g, "");
  if (dbType === "mysql" || dbType === "mariadb") {
    return `\`${clean}\``;
  }
  if (dbType === "mssql" || dbType === "sqlserver" || dbType === "sql_server") {
    return `[${clean}]`;
  }
  return `"${clean}"`;
}

function qualifiedTable(refTable: string, refSchema: string | undefined, dbType: string): string {
  if (refSchema) {
    return `${quoteIdent(refSchema, dbType)}.${quoteIdent(refTable, dbType)}`;
  }
  return quoteIdent(refTable, dbType);
}

function isTextLikeType(typeName: string): boolean {
  const upper = typeName.toUpperCase();
  return (
    upper.includes("CHAR") ||
    upper.includes("TEXT") ||
    upper.includes("NAME") ||
    upper.includes("VARCHAR") ||
    upper.includes("STRING")
  );
}

export function ForeignKeyCellEditor({
  sessionId,
  fkRef,
  value,
  onCommit,
  onCancel,
}: ForeignKeyCellEditorProps) {
  const [searchText, setSearchText] = useState("");
  const [options, setOptions] = useState<{ id: string; display: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const activeConnection = selectedConnectionId ? connections.get(selectedConnectionId) : null;
  const dbType = activeConnection?.config.dbType || "postgres";

  useEffect(() => {
    let active = true;
    const loadFkValues = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch referenced table columns
        const columns = await useSchemaStore
          .getState()
          .fetchColumns(sessionId, fkRef.refTable, fkRef.refSchema ?? undefined);

        if (!active) return;

        // Try to find a display/label column (e.g. text/name fields)
        const displayColumn = columns.find((col) => {
          const isFkCol = col.name.toLowerCase() === fkRef.refColumn.toLowerCase();
          return !isFkCol && !col.isPrimaryKey && isTextLikeType(col.typeName);
        })?.name;

        // Construct query
        const quotedTable = qualifiedTable(fkRef.refTable, fkRef.refSchema ?? undefined, dbType);
        const quotedColumn = quoteIdent(fkRef.refColumn, dbType);

        let query = "";
        const limit = 1000;

        if (displayColumn) {
          const quotedDisplay = quoteIdent(displayColumn, dbType);
          if (dbType === "mssql" || dbType === "sqlserver" || dbType === "sql_server") {
            query = `SELECT TOP ${limit} ${quotedColumn}, ${quotedDisplay} FROM ${quotedTable} ORDER BY ${quotedColumn}`;
          } else {
            query = `SELECT ${quotedColumn}, ${quotedDisplay} FROM ${quotedTable} ORDER BY ${quotedColumn} LIMIT ${limit}`;
          }
        } else {
          if (dbType === "mssql" || dbType === "sqlserver" || dbType === "sql_server") {
            query = `SELECT DISTINCT TOP ${limit} ${quotedColumn} FROM ${quotedTable} ORDER BY ${quotedColumn}`;
          } else {
            query = `SELECT DISTINCT ${quotedColumn} FROM ${quotedTable} ORDER BY ${quotedColumn} LIMIT ${limit}`;
          }
        }

        const result: QueryResult = await executeQuery(sessionId, query);
        if (!active) return;

        const values = result.rows.map((row) => {
          const idVal = row[0] ?? "";
          let displayVal = idVal;
          if (displayColumn && row.length > 1 && row[1] !== null && row[1] !== undefined) {
            displayVal = `${idVal} — ${row[1]}`;
          }
          return { id: idVal, display: displayVal };
        });

        setOptions(values);

        if (value !== null) {
          const idx = values.findIndex((v) => v.id === value);
          if (idx >= 0) {
            setActiveIndex(idx);
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadFkValues();
    return () => {
      active = false;
    };
  }, [sessionId, fkRef.refTable, fkRef.refColumn, fkRef.refSchema, dbType, value]);

  // Adjust activeIndex when filter changes
  const filtered = options.filter((opt) =>
    opt.display.toLowerCase().includes(searchText.toLowerCase())
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [searchText]);

  // Autofocus input
  useEffect(() => {
    if (!isLoading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isLoading]);

  // Auto-scroll list
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        const container = listRef.current;
        const topDiff = activeEl.offsetTop - container.scrollTop;
        const bottomDiff =
          activeEl.offsetTop + activeEl.clientHeight - (container.scrollTop + container.clientHeight);
        if (topDiff < 0) {
          container.scrollTop += topDiff;
        } else if (bottomDiff > 0) {
          container.scrollTop += bottomDiff;
        }
      }
    }
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (filtered.length > 0 && activeIndex >= 0 && activeIndex < filtered.length) {
        onCommit(filtered[activeIndex].id);
      } else {
        onCancel();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (filtered.length > 0 && activeIndex >= 0 && activeIndex < filtered.length) {
        onCommit(filtered[activeIndex].id);
      } else {
        onCancel();
      }
    }
  };

  return (
    <div
      className="absolute top-0 left-0 z-50 w-[420px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-xl flex flex-col"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={13} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={`Search ${fkRef.refTable}...`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-8 pr-3 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-xs focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-100"
          />
        </div>
        <button
          type="button"
          onClick={() => onCommit(null)}
          className="px-2 py-1 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-650 border border-zinc-300 dark:border-zinc-600 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-350 cursor-pointer transition-colors"
        >
          Set NULL
        </button>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-700" />

      {isLoading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="animate-spin text-zinc-400 dark:text-zinc-500" size={14} />
          <span>Loading referenced keys...</span>
        </div>
      ) : error ? (
        <div className="p-3 text-xs text-red-600 dark:text-red-400 select-text overflow-auto max-h-32 whitespace-pre-wrap">
          Error loading values: {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          No matching values found
        </div>
      ) : (
        <div
          ref={listRef}
          className="max-h-56 overflow-y-auto py-1 font-mono text-[11px] leading-normal"
        >
          {filtered.map((opt, idx) => {
            const isActive = idx === activeIndex;
            const isCurrent = opt.id === value;
            return (
              <div
                key={opt.id}
                onClick={() => onCommit(opt.id)}
                className={`px-3 py-1 cursor-pointer transition-colors truncate ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                    : isCurrent
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 font-bold"
                    : "text-zinc-700 dark:text-zinc-350 hover:bg-zinc-50 dark:hover:bg-zinc-750"
                }`}
                title={opt.display}
              >
                {opt.display}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
