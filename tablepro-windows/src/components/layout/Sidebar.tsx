import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Table2,
  Search,
  Key,
  Hash,
  AlignLeft,
  Calendar,
  ToggleLeft,
  Binary,
} from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import type { TableInfo } from "../../types/schema";
import type { ColumnInfo } from "../../types/query";

interface SidebarProps {
  onViewStructure?: (tableName: string, schema?: string | null) => void;
}

export function Sidebar({ onViewStructure }: SidebarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const sessionIds = useConnectionStore((s) => s.sessionIds);
  const connections = useConnectionStore((s) => s.connections);
  const { tables, databases, selectedDatabase, isLoading, fetchDatabases, fetchSchema, selectDatabase } =
    useSchemaStore();
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const sessionId = selectedConnectionId ? sessionIds.get(selectedConnectionId) : undefined;
  const activeConnection = selectedConnectionId ? connections.get(selectedConnectionId) : undefined;
  const configDatabase = activeConnection?.config?.database;

  // Fetch database list when session changes
  useEffect(() => {
    if (sessionId) {
      fetchDatabases(sessionId);
    }
  }, [sessionId, fetchDatabases]);

  // Auto-select the initially connected database and load its tables
  useEffect(() => {
    if (sessionId && databases.length > 0 && !selectedDatabase && configDatabase) {
      // Already connected to this database — just set selection and fetch tables
      useSchemaStore.setState({ selectedDatabase: configDatabase });
      fetchSchema(sessionId);
    }
  }, [sessionId, databases, selectedDatabase, configDatabase, fetchSchema]);

  const toggleTable = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredTables = filter
    ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : tables;

  return (
    <div className="flex h-full flex-col border-r border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Search */}
      <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
        <div className="flex items-center gap-1.5 rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800">
          <Search size={12} className="text-zinc-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tables…"
            className="flex-1 bg-transparent text-xs text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-200"
          />
        </div>
      </div>

      {/* Database selector */}
      {databases.length > 0 && (
        <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
          <select
            value={selectedDatabase ?? ""}
            onChange={(e) => {
              if (sessionId) selectDatabase(sessionId, e.target.value || null);
            }}
            className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">Select database…</option>
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-3 text-xs text-zinc-400">Loading…</div>
        )}
        {!isLoading && !selectedConnectionId && (
          <div className="p-3 text-xs text-zinc-400">No connection selected</div>
        )}
        {!isLoading && selectedConnectionId && !selectedDatabase && databases.length === 0 && (
          <div className="p-3 text-xs text-zinc-400">Connect to load schema</div>
        )}
        {filteredTables.map((table) => (
          <TableNode
            key={table.name}
            table={table}
            expanded={expandedTables.has(table.name)}
            onToggle={() => toggleTable(table.name)}
            sessionId={sessionId ?? null}
            onViewStructure={onViewStructure}
          />
        ))}
      </div>
    </div>
  );
}

// Column type icons & colors
function getColumnIcon(typeName: string) {
  const t = typeName.toLowerCase();
  if (t.includes("int") || t.includes("float") || t.includes("double") || t.includes("numeric") || t.includes("decimal")) {
    return <Hash size={10} className="shrink-0 text-blue-400" />;
  }
  if (t.includes("char") || t.includes("text") || t.includes("string") || t.includes("varchar")) {
    return <AlignLeft size={10} className="shrink-0 text-green-500" />;
  }
  if (t.includes("date") || t.includes("time") || t.includes("timestamp")) {
    return <Calendar size={10} className="shrink-0 text-purple-500" />;
  }
  if (t.includes("bool")) {
    return <ToggleLeft size={10} className="shrink-0 text-orange-500" />;
  }
  return <Binary size={10} className="shrink-0 text-zinc-400" />;
}

interface ContextMenuState {
  x: number;
  y: number;
  tableName: string;
  schema?: string | null;
}

interface TableNodeProps {
  table: TableInfo;
  expanded: boolean;
  onToggle: () => void;
  sessionId: string | null;
  onViewStructure?: (tableName: string, schema?: string | null) => void;
}

function TableNode({ table, expanded, onToggle, sessionId, onViewStructure }: TableNodeProps) {
  const { fetchColumns, columnsByTable } = useSchemaStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  const columns: ColumnInfo[] = columnsByTable.get(table.name) ?? [];

  useEffect(() => {
    if (expanded && sessionId && columns.length === 0) {
      fetchColumns(sessionId, table.name, table.schema ?? undefined).catch(() => {});
    }
  }, [expanded, sessionId, table.name, table.schema, columns.length, fetchColumns]);

  // Close context menu on outside click
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
      setContextMenu({ x: e.clientX, y: e.clientY, tableName: table.name, schema: table.schema });
    },
    [table.name, table.schema]
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

  return (
    <>
      <div>
        <div
          onClick={onToggle}
          onContextMenu={handleContextMenu}
          onDoubleClick={() => onViewStructure?.(table.name, table.schema)}
          className="flex cursor-pointer items-center gap-1 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {expanded ? (
            <ChevronDown size={12} className="text-zinc-400" />
          ) : (
            <ChevronRight size={12} className="text-zinc-400" />
          )}
          <Table2 size={12} className="text-blue-500" />
          <span className="truncate text-zinc-700 dark:text-zinc-300">{table.name}</span>
          {table.rowCountEstimate != null && (
            <span className="ml-auto text-[10px] text-zinc-400">
              {table.rowCountEstimate.toLocaleString()}
            </span>
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

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded border border-zinc-200 bg-white py-0.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
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
