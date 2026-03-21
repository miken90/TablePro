import { Search, Database, Plus, Table2, Eye } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { SidebarTableNode } from "./sidebar-table-node";
import { SidebarObjectGroup } from "./sidebar-object-group";
import { CreateTableWizard } from "../structure/create-table-wizard";
import { EnvironmentBadge } from "../connection/environment-badge";
import { ConnectionStatusIndicator } from "../connection/connection-status-indicator";
import { ConnectionGroup } from "../connection/connection-group";

interface SidebarProps {
  onViewStructure?: (tableName: string, schema?: string | null) => void;
  onOpenTable?: (tableName: string, schema?: string | null) => void;
  onOpenPreviewTable?: (tableName: string, schema?: string | null) => void;
}

// Tags in display priority order
const ORDERED_TAGS = ["production", "staging", "development", "testing", "local"] as const;

export function Sidebar({ onViewStructure, onOpenTable, onOpenPreviewTable }: SidebarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const sessionIds = useConnectionStore((s) => s.sessionIds);
  const connections = useConnectionStore((s) => s.connections);
  const connectionStatuses = useConnectionStore((s) => s.connectionStatuses);
  const getStatus = useConnectionStore((s) => s.getStatus);
  const connect = useConnectionStore((s) => s.connect);
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

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

  // Group filtered tables by type
  const grouped = useMemo(() => {
    const tbl = filteredTables.filter((t) => t.tableType !== "VIEW");
    const views = filteredTables.filter((t) => t.tableType === "VIEW");
    return { tables: tbl, views };
  }, [filteredTables]);

  // Group connections by tag for the connection list section
  const connList = useMemo(() => Array.from(connections.values()), [connections]);

  const connectionsByTag = useMemo(() => {
    const byTag = new Map<string, typeof connList>();
    for (const conn of connList) {
      const key = conn.tag?.toLowerCase() ?? "__other__";
      const existing = byTag.get(key) ?? [];
      byTag.set(key, [...existing, conn]);
    }
    return byTag;
  }, [connList]);

  // Recent connections: top 3 with connected status (or previously connected)
  const recentConnections = useMemo(() => {
    return connList
      .filter((c) => {
        const s = connectionStatuses.get(c.id);
        return s === "connected" || s === "connecting";
      })
      .slice(0, 3);
  }, [connList, connectionStatuses]);

  const handleQuickConnect = async (connId: string) => {
    const conn = connections.get(connId);
    if (!conn) return;
    setConnectingId(connId);
    try {
      await connect(connId, conn.config);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <nav
      className="flex h-full flex-col border-r border-border bg-surface text-sm text-text-primary"
      aria-label="Database sidebar"
    >
      {/* Active connection indicator */}
      {activeConnection && (
        <div className="border-b border-border px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-xs">
            <ConnectionStatusIndicator status={getStatus(activeConnection.id)} />
            <span className="max-w-[110px] truncate text-text-primary">
              {activeConnection.name}
            </span>
            <EnvironmentBadge tag={activeConnection.tag} />
          </div>
        </div>
      )}

      {/* Recent Connections — only when no active session and multiple connections exist */}
      {!sessionId && recentConnections.length > 0 && (
        <div className="border-b border-border dark:border-zinc-700">
          <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Recent
          </p>
          {recentConnections.map((conn) => (
            <button
              key={conn.id}
              onClick={() => void handleQuickConnect(conn.id)}
              disabled={connectingId === conn.id}
              aria-label={`Connect to ${conn.name}`}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-surface-muted disabled:opacity-60 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
            >
              <ConnectionStatusIndicator status={getStatus(conn.id)} />
              <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                {conn.name}
              </span>
              <EnvironmentBadge tag={conn.tag} />
            </button>
          ))}
        </div>
      )}

      {/* Connection list grouped by tag — only when no active session */}
      {!sessionId && connList.length > 0 && (
        <div className="border-b border-border">
          {ORDERED_TAGS.filter((tag) => connectionsByTag.has(tag)).map((tag) => {
            const tagConns = connectionsByTag.get(tag) ?? [];
            return (
              <ConnectionGroup
                key={tag}
                tag={tag}
                label={tag}
                count={tagConns.length}
              >
                {tagConns.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => void handleQuickConnect(conn.id)}
                    disabled={connectingId === conn.id}
                    aria-label={`Connect to ${conn.name}`}
                    className="flex w-full items-center gap-1.5 py-1.5 pl-6 pr-2 text-left hover:bg-surface-muted disabled:opacity-60 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
                  >
                    <ConnectionStatusIndicator status={getStatus(conn.id)} />
                    <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                      {conn.name}
                    </span>
                  </button>
                ))}
              </ConnectionGroup>
            );
          })}

          {connectionsByTag.has("__other__") && (
            <ConnectionGroup
              tag={null}
              label="Other"
              count={(connectionsByTag.get("__other__") ?? []).length}
            >
              {(connectionsByTag.get("__other__") ?? []).map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => void handleQuickConnect(conn.id)}
                  disabled={connectingId === conn.id}
                  aria-label={`Connect to ${conn.name}`}
                  className="flex w-full items-center gap-1.5 py-1.5 pl-6 pr-2 text-left hover:bg-surface-muted disabled:opacity-60 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
                >
                  <ConnectionStatusIndicator status={getStatus(conn.id)} />
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                    {conn.name}
                  </span>
                </button>
              ))}
            </ConnectionGroup>
          )}
        </div>
      )}

      {/* Search */}
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-1.5 rounded border border-border bg-surface-elevated px-2 py-1">
          <Search size={12} className="text-text-muted" aria-hidden="true" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tables…"
            aria-label="Filter tables"
            className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          disabled={!sessionId}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={12} aria-hidden="true" />
          New Table
        </button>
      </div>

      {/* Database selector */}
      {databases.length > 0 && (
        <div className="border-b border-border p-2">
          <select
            value={selectedDatabase ?? ""}
            onChange={(e) => {
              if (sessionId) selectDatabase(sessionId, e.target.value || null);
            }}
            aria-label="Select database"
            className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary"
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
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-1.5">
            <Database size={11} className="shrink-0 text-accent-indigo" aria-hidden="true" />
            <select
              value={currentSchema ?? ""}
              onChange={(e) => setCurrentSchema(e.target.value || null)}
              aria-label="Select schema"
              className="flex-1 rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary"
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
      <div className="flex-1 overflow-y-auto" role="tree" aria-label="Tables">
        {isLoading && (
          <div className="p-3 text-xs text-text-muted" aria-live="polite">Loading…</div>
        )}
        {!isLoading && !selectedConnectionId && (
          <div className="p-3 text-xs text-text-muted">No connection selected</div>
        )}
        {!isLoading && selectedConnectionId && !selectedDatabase && databases.length === 0 && (
          <div className="p-3 text-xs text-text-muted">Connect to load schema</div>
        )}
        {filteredTables.length > 0 && (
          <>
            <SidebarObjectGroup label="Tables" icon={Table2} count={grouped.tables.length} defaultExpanded>
              {grouped.tables.map((table) => (
                <SidebarTableNode
                  key={`${table.schema ?? ""}.${table.name}`}
                  table={table}
                  expanded={expandedTables.has(table.name)}
                  onToggle={() => toggleTable(table.name)}
                  sessionId={sessionId ?? null}
                  onViewStructure={onViewStructure}
                  onOpenTable={onOpenTable}
                  onOpenPreviewTable={onOpenPreviewTable}
                />
              ))}
            </SidebarObjectGroup>
            {grouped.views.length > 0 && (
              <SidebarObjectGroup label="Views" icon={Eye} count={grouped.views.length}>
                {grouped.views.map((table) => (
                  <SidebarTableNode
                    key={`${table.schema ?? ""}.${table.name}`}
                    table={table}
                    expanded={expandedTables.has(table.name)}
                    onToggle={() => toggleTable(table.name)}
                    sessionId={sessionId ?? null}
                    onViewStructure={onViewStructure}
                    onOpenTable={onOpenTable}
                    onOpenPreviewTable={onOpenPreviewTable}
                  />
                ))}
              </SidebarObjectGroup>
            )}
          </>
        )}
      </div>

      {sessionId && activeConnection && (
        <CreateTableWizard
          open={wizardOpen}
          sessionId={sessionId}
          driverType={activeConnection.config.dbType}
          availableSchemas={schemas}
          initialSchema={currentSchema}
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            void fetchSchema(sessionId);
          }}
        />
      )}
    </nav>
  );
}
