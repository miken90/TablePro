import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronRight, ChevronDown, Table2, Key } from "lucide-react";
import type { TableInfo } from "../../types/schema";
import type { ColumnInfo } from "../../types/query";
import { useSchemaStore } from "../../stores/schemaStore";
import { getColumnIcon } from "./sidebar-column-icons";

interface ContextMenuState {
  x: number;
  y: number;
}

interface SidebarTableNodeProps {
  table: TableInfo;
  expanded: boolean;
  onToggle: () => void;
  sessionId: string | null;
  onViewStructure?: (tableName: string, schema?: string | null) => void;
  onOpenTable?: (tableName: string, schema?: string | null) => void;
  onOpenPreviewTable?: (tableName: string, schema?: string | null) => void;
}

export function SidebarTableNode({
  table,
  expanded,
  onToggle,
  sessionId,
  onViewStructure,
  onOpenTable,
  onOpenPreviewTable,
}: SidebarTableNodeProps) {
  const { fetchColumns, columnsByTable } = useSchemaStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  const columns: ColumnInfo[] = columnsByTable.get(table.name) ?? [];

  useEffect(() => {
    if (expanded && sessionId && columns.length === 0) {
      fetchColumns(sessionId, table.name, table.schema ?? undefined).catch(() => {});
    }
  }, [expanded, sessionId, table.name, table.schema, columns.length, fetchColumns]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCopyName = () => {
    navigator.clipboard.writeText(table.name);
    setContextMenu(null);
  };

  const handleCopySelect = () => {
    const q = `SELECT * FROM "${table.name}"`;
    navigator.clipboard.writeText(q);
    setContextMenu(null);
  };

  const handleViewStructure = () => {
    onViewStructure?.(table.name, table.schema);
    setContextMenu(null);
  };

  const handleOpenTable = () => {
    onOpenTable?.(table.name, table.schema);
    setContextMenu(null);
  };

  /**
   * Single-click: open in table-browse mode (server-side pagination + inline edit).
   * If Ctrl/Cmd held → open as preview SQL tab in query mode.
   * Double-click: open Structure View (existing behavior preserved).
   */
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const isQueryMode = e.ctrlKey || e.metaKey;
      if (isQueryMode) {
        onOpenPreviewTable?.(table.name, table.schema);
      } else {
        onOpenTable?.(table.name, table.schema);
      }
    },
    [table.name, table.schema, onOpenTable, onOpenPreviewTable],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Double-click → Structure View (existing behavior preserved)
      onViewStructure?.(table.name, table.schema);
    },
    [table.name, table.schema, onViewStructure],
  );

  return (
    <>
      <div>
        <div
          onClick={handleRowClick}
          onContextMenu={handleContextMenu}
          onDoubleClick={handleDoubleClick}
          className="flex cursor-pointer items-center gap-1 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="shrink-0"
          >
            {expanded ? (
              <ChevronDown size={12} className="text-zinc-400" />
            ) : (
              <ChevronRight size={12} className="text-zinc-400" />
            )}
          </span>
          <Table2 size={12} className="text-blue-500" />
          <span className="truncate text-zinc-700 dark:text-zinc-300">{table.name}</span>
          {table.rowCountEstimate != null && (
            <span className="ml-auto text-[10px] text-zinc-400">{table.rowCountEstimate.toLocaleString()}</span>
          )}
        </div>
        {expanded && (
          <div className="pl-6">
            {columns.length === 0 ? (
              <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-zinc-400">
                <span>Loading…</span>
              </div>
            ) : (
              columns.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400"
                >
                  {col.isPrimaryKey ? (
                    <Key size={10} className="shrink-0 text-amber-500" />
                  ) : (
                    getColumnIcon(col.typeName)
                  )}
                  <span className="truncate text-zinc-600 dark:text-zinc-300">{col.name}</span>
                  <span className="ml-auto shrink-0 text-[9px] text-zinc-400">{col.typeName}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          ref={contextRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded border border-zinc-200 bg-white py-0.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
          <button
            onClick={handleOpenTable}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Open Table
          </button>
          <div className="my-0.5 border-t border-zinc-100 dark:border-zinc-700" />
          <button
            onClick={handleCopyName}
            className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Copy Table Name
          </button>
          <button
            onClick={handleCopySelect}
            className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Copy SELECT *
          </button>
          <div className="my-0.5 border-t border-zinc-100 dark:border-zinc-700" />
          <button
            onClick={handleViewStructure}
            className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            View Structure
          </button>
        </div>
      )}
    </>
  );
}
