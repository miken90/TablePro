import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronRight, ChevronDown, Table2, Key } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  isActive?: boolean;
  onToggle: () => void;
  sessionId: string | null;
  onViewStructure?: (tableName: string, schema?: string | null) => void;
  onOpenTable?: (tableName: string, schema?: string | null) => void;
  onOpenPreviewTable?: (tableName: string, schema?: string | null) => void;
  onTruncateTable?: (tableName: string, schema?: string | null) => void;
  onDeleteAllRecords?: (tableName: string, schema?: string | null) => void;
  /** `isView` decides whether the statement is DROP TABLE or DROP VIEW. */
  onDropTable?: (tableName: string, schema: string | null | undefined, isView: boolean) => void;
}

export function SidebarTableNode({
  table,
  expanded,
  isActive = false,
  onToggle,
  sessionId,
  onViewStructure,
  onOpenTable,
  onOpenPreviewTable,
  onTruncateTable,
  onDeleteAllRecords,
  onDropTable,
}: SidebarTableNodeProps) {
  const { t } = useTranslation();
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

  const isView = table.tableType?.toLowerCase() === 'view';

  const handleTruncate = () => {
    onTruncateTable?.(table.name, table.schema);
    setContextMenu(null);
  };

  const handleDeleteAll = () => {
    onDeleteAllRecords?.(table.name, table.schema);
    setContextMenu(null);
  };

  const handleDropTable = () => {
    onDropTable?.(table.name, table.schema, isView);
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
          className={`flex cursor-pointer items-center gap-1 px-2 py-1 text-xs transition-colors ${
            isActive
              ? "bg-accent-blue/15 text-accent-blue"
              : "text-text-primary hover:bg-surface-muted"
          }`}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="shrink-0"
          >
            {expanded ? (
              <ChevronDown size={12} className="text-text-muted" />
            ) : (
              <ChevronRight size={12} className="text-text-muted" />
            )}
          </span>
          <Table2 size={12} className={isActive ? "text-accent-blue" : "text-text-secondary"} />
          <span className={`truncate ${isActive ? "font-medium text-accent-blue" : "text-text-primary"}`}>
            {table.name}
          </span>
          {table.rowCountEstimate != null && (
            <span className="ml-auto text-[10px] text-text-muted">{table.rowCountEstimate.toLocaleString()}</span>
          )}
        </div>
        {expanded && (
          <div className="pl-6">
            {columns.length === 0 ? (
              <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-text-muted">
                <span>Loading…</span>
              </div>
            ) : (
              columns.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-text-secondary"
                >
                  {col.isPrimaryKey ? (
                    <Key size={10} className="shrink-0 text-accent-yellow" />
                  ) : (
                    getColumnIcon(col.typeName)
                  )}
                  <span className="truncate text-text-primary">{col.name}</span>
                  <span className="ml-auto shrink-0 text-[9px] text-text-muted">{col.typeName}</span>
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
          className="fixed z-50 min-w-[160px] overflow-hidden rounded border border-border bg-surface-elevated py-0.5 shadow-lg"
        >
          <button
            onClick={handleOpenTable}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs font-medium"
          >
            {t("sidebar.openTable")}
          </button>
          <div className="my-0.5 border-t border-border" />
          <button
            onClick={handleCopyName}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs"
          >
            {t("sidebar.copyTableName")}
          </button>
          <button
            onClick={handleCopySelect}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs"
          >
            {t("sidebar.copySelect")}
          </button>
          <div className="my-0.5 border-t border-border" />
          <button
            onClick={handleViewStructure}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs"
          >
            {t("sidebar.viewStructure")}
          </button>
          <div className="my-0.5 border-t border-border" />
          {!isView && (
            <button
              onClick={handleTruncate}
              className="menu-item-button w-full px-3 py-1.5 text-left text-xs text-text-primary"
            >
              Truncate Table
            </button>
          )}
          {!isView && (
            <button
              onClick={handleDeleteAll}
              className="menu-item-button w-full px-3 py-1.5 text-left text-xs text-text-primary"
            >
              Delete All Records
            </button>
          )}
          <button
            onClick={handleDropTable}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs text-accent-red"
          >
            {isView ? 'Drop View' : 'Drop Table'}
          </button>
        </div>
      )}
    </>
  );
}
