import { useState, useEffect } from "react";
import { Search, Database } from "lucide-react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { SidebarTableNode } from "./sidebar-table-node";

interface SidebarProps {
  onViewStructure?: (tableName: string, schema?: string | null) => void;
  onOpenTable?: (tableName: string, schema?: string | null) => void;
}

export function Sidebar({ onViewStructure, onOpenTable }: SidebarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const sessionIds = useConnectionStore((s) => s.sessionIds);
  const connections = useConnectionStore((s) => s.connections);
  const {
    tables,
    databases,
    selectedDatabase,
    schemas,
    currentSchema,
    isLoading,
    fetchDatabases,
    fetchSchema,
    fetchSchemas,
    selectDatabase,
    setCurrentSchema,
  } = useSchemaStore();
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

  // Auto-select the initially connected database and load its tables + schemas
  useEffect(() => {
    if (sessionId && databases.length > 0 && !selectedDatabase && configDatabase) {
      useSchemaStore.setState({ selectedDatabase: configDatabase });
      fetchSchema(sessionId).then(() => fetchSchemas(sessionId));
    }
  }, [sessionId, databases, selectedDatabase, configDatabase, fetchSchema, fetchSchemas]);

  // When schema changes, clear expanded tables
  useEffect(() => {
    setExpandedTables(new Set());
  }, [currentSchema]);

  const toggleTable = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Filter by text search AND by currentSchema
  const filteredTables = tables.filter((t) => {
    const matchesFilter = !filter || t.name.toLowerCase().includes(filter.toLowerCase());
    const matchesSchema = !currentSchema || t.schema === currentSchema;
    return matchesFilter && matchesSchema;
  });

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

      {/* Schema selector — only shown for PostgreSQL (when schemas are available) */}
      {schemas.length > 0 && (
        <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
          <div className="flex items-center gap-1.5">
            <Database size={11} className="shrink-0 text-indigo-400" />
            <select
              value={currentSchema ?? ""}
              onChange={(e) => setCurrentSchema(e.target.value || null)}
              className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              <option value="">All schemas</option>
              {schemas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
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
          <SidebarTableNode
            key={`${table.schema ?? ""}.${table.name}`}
            table={table}
            expanded={expandedTables.has(table.name)}
            onToggle={() => toggleTable(table.name)}
            sessionId={sessionId ?? null}
            onViewStructure={onViewStructure}
            onOpenTable={onOpenTable}
          />
        ))}
      </div>
    </div>
  );
}

