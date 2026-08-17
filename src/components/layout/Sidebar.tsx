import { Search, Database, Plus, RefreshCw, Table2, Eye, Braces, ScrollText, FolderOpen } from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSchemaStore } from "../../stores/schemaStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useEditorStore } from "../../stores/editorStore";
import { useQueryStore } from "../../stores/queryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { SidebarTableNode } from "./sidebar-table-node";
import { SidebarObjectGroup } from "./sidebar-object-group";
import { CreateTableWizard } from "../structure/create-table-wizard";
import { EnvironmentBadge } from "../connection/environment-badge";
import { ConnectionStatusIndicator } from "../connection/connection-status-indicator";
import { ConnectionGroup } from "../connection/connection-group";
import { SidebarRoutineNode } from "../procedures/sidebar-routine-node";
import { ProcedureExecuteDialog } from "../procedures/procedure-execute-dialog";
import { ProcedureSourcePanel } from "../procedures/procedure-source-panel";
import { TableOperationDialog, type TableOperationType } from "./table-operation-dialog";
import type { RoutineInfo } from "../../types/schema";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";

interface SidebarProps {
  onViewStructure?: (tableName: string, schema?: string | null) => void;
  onOpenTable?: (tableName: string, schema?: string | null) => void;
  onOpenPreviewTable?: (tableName: string, schema?: string | null) => void;
}

// Tags in display priority order
const ORDERED_TAGS = ["production", "staging", "development", "testing", "local"] as const;

/** Refresh the object tree once a statement parked behind the Safe Mode
 *  confirmation dialog has run (or been abandoned). Without this a table
 *  dropped after confirming stays visible until a manual refresh. */
function refreshSchemaAfterSafeCheck(
  sessionId: string,
  refresh: (sessionId: string) => void,
): void {
  const unsubscribe = useQueryStore.subscribe((state) => {
    if (state.pendingSafeCheck || state.isExecuting) return;
    unsubscribe();
    refresh(sessionId);
  });
}

export function Sidebar({ onViewStructure, onOpenTable, onOpenPreviewTable }: SidebarProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const sessionIds = useConnectionStore((s) => s.sessionIds);
  const connections = useConnectionStore((s) => s.connections);
  const activeTableContext = useLayoutStore((s) => s.activeTableContext);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const connectionStatuses = useConnectionStore((s) => s.connectionStatuses);
  const getStatus = useConnectionStore((s) => s.getStatus);
  const connect = useConnectionStore((s) => s.connect);
  const {
    tables,
    databases,
    selectedDatabase,
    schemas,
    currentSchema,
    routineCatalog,
    isLoading,
    capabilities,
    fetchDatabases,
    fetchSchema,
    fetchSchemas,
    selectDatabase,
    setCurrentSchema,
    setCapabilities,
  } = useSchemaStore();
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [executeRoutine, setExecuteRoutine] = useState<RoutineInfo | null>(null);
  const [viewSourceRoutine, setViewSourceRoutine] = useState<RoutineInfo | null>(null);

  // Table operation dialog state
  const [tableOpDialog, setTableOpDialog] = useState<{
    operation: TableOperationType;
    tableName: string;
    schema?: string | null;
  } | null>(null);

  const safeModeLevel = useSettingsStore((s) => s.settings.safeModeLevel);

  const { t } = useTranslation();
  const [dbContextMenu, setDbContextMenu] = useState<{ x: number; y: number } | null>(null);
  const dbContextRef = useRef<HTMLDivElement>(null);

  // Handle click-away for database context menu
  useEffect(() => {
    if (!dbContextMenu) return;
    const handler = (e: MouseEvent) => {
      if (dbContextRef.current && !dbContextRef.current.contains(e.target as Node)) {
        setDbContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [dbContextMenu]);

  const handleDbContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDbContextMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const sessionId = selectedConnectionId ? sessionIds.get(selectedConnectionId) : undefined;
  const activeConnection = selectedConnectionId ? connections.get(selectedConnectionId) : undefined;
  const configDatabase = activeConnection?.config?.database;
  const dbType = activeConnection?.config?.dbType;
  const isDocumentDb = capabilities.supportsCollections && !capabilities.supportsSqlEditor;
  const isKeyValueDb = dbType === "redis";

  const activeTableIdentity = useMemo(() => {
    if (activeTableContext) {
      return {
        name: activeTableContext.tableName,
        schema: activeTableContext.schema ?? null,
      };
    }

    if (activeTab?.type === "table" && activeTab.tableName) {
      return {
        name: activeTab.tableName,
        schema: activeTab.tableSchema ?? null,
      };
    }

    return null;
  }, [activeTableContext, activeTab]);

  const isTableActive = useCallback(
    (tableName: string, schema?: string | null) => {
      if (!activeTableIdentity) return false;
      const normalizedSchema = schema ?? null;
      return activeTableIdentity.name === tableName && activeTableIdentity.schema === normalizedSchema;
    },
    [activeTableIdentity],
  );

  // Load driver capabilities when connection changes
  useEffect(() => {
    if (dbType) {
      void commands.getDriverCapabilities(dbType).then(setCapabilities).catch(() => {
        // Fall back to defaults — SQL capabilities assumed
      });
    }
  }, [dbType, setCapabilities]);

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
    const matchesFilter = !deferredFilter || t.name.toLowerCase().includes(deferredFilter.toLowerCase());
    const matchesSchema = !currentSchema || t.schema === currentSchema;
    return matchesFilter && matchesSchema;
  });

  // Group filtered tables by type
  const grouped = useMemo(() => {
    const tbl = filteredTables.filter((t) => t.tableType !== "VIEW");
    const views = filteredTables.filter((t) => t.tableType === "VIEW");
    return { tables: tbl, views };
  }, [filteredTables]);

  const filteredRoutines = useMemo(() => {
    const items = routineCatalog?.items ?? [];
    return items.filter((routine) => {
      const matchesFilter = !deferredFilter || routine.name.toLowerCase().includes(deferredFilter.toLowerCase());
      const matchesSchema = !currentSchema || routine.schema === currentSchema;
      return matchesFilter && matchesSchema;
    });
  }, [routineCatalog, deferredFilter, currentSchema]);

  const routinesGrouped = useMemo(() => {
    const functions = filteredRoutines.filter((routine) => routine.kind === "function");
    const procedures = filteredRoutines.filter((routine) => routine.kind === "procedure");
    return { functions, procedures };
  }, [filteredRoutines]);

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
        <div className="border-b border-border">
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
            placeholder={isKeyValueDb ? "Filter keys\u2026" : isDocumentDb ? "Filter collections\u2026" : "Filter tables\u2026"}
            aria-label={isKeyValueDb ? "Filter keys" : isDocumentDb ? "Filter collections" : "Filter tables"}
            className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <div className="mt-2 flex gap-1.5">
          {capabilities.supportsDdl && (
            <button
              onClick={() => setWizardOpen(true)}
              disabled={!sessionId}
              className="flex flex-1 items-center justify-center gap-1 rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={12} aria-hidden="true" />
              New Table
            </button>
          )}
          <button
            onClick={() => { if (sessionId) fetchSchema(sessionId); }}
            disabled={!sessionId || isLoading}
            title="Refresh schema (reload tables)"
            className="flex items-center justify-center rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Database selector */}
      {databases.length > 0 && (
        <div 
          className="border-b border-border p-2"
          onContextMenu={handleDbContextMenu}
        >
          <select
            value={selectedDatabase ?? ""}
            onChange={(e) => {
              if (sessionId) selectDatabase(sessionId, e.target.value || null);
            }}
            onKeyDown={(e) => {
              if (e.key === "F5") {
                e.preventDefault();
                if (sessionId) void fetchSchema(sessionId);
              }
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
      <div className="flex-1 overflow-y-auto" role="tree" aria-label={isKeyValueDb ? "Keys" : isDocumentDb ? "Collections" : "Tables"}>
        {isLoading && (
          <div className="p-3 text-xs text-text-muted" aria-live="polite">Loading…</div>
        )}
        {!isLoading && !selectedConnectionId && (
          <div className="p-3 text-xs text-text-muted">No connection selected</div>
        )}
        {!isLoading && selectedConnectionId && !selectedDatabase && databases.length === 0 && (
          <div className="p-3 text-xs text-text-muted">Connect to load schema</div>
        )}
        {(filteredTables.length > 0 || routineCatalog?.supported) && (
          <>
            <SidebarObjectGroup
              label={isKeyValueDb ? "Keys" : isDocumentDb ? "Collections" : "Tables"}
              icon={isDocumentDb ? FolderOpen : Table2}
              count={grouped.tables.length}
              defaultExpanded
            >
              {grouped.tables.map((table) => (
                <SidebarTableNode
                  key={`${table.schema ?? ""}.${table.name}`}
                  table={table}
                  expanded={expandedTables.has(table.name)}
                  onToggle={() => toggleTable(table.name)}
                  sessionId={sessionId ?? null}
                  isActive={isTableActive(table.name, table.schema)}
                  onViewStructure={capabilities.supportsStructureView ? onViewStructure : undefined}
                  onOpenTable={onOpenTable}
                  onOpenPreviewTable={onOpenPreviewTable}
                  onTruncateTable={(name, schema) => setTableOpDialog({ operation: 'truncate', tableName: name, schema })}
                  onDeleteAllRecords={(name, schema) => setTableOpDialog({ operation: 'delete-all', tableName: name, schema })}
                  onDropTable={(name, schema, isView) => setTableOpDialog({ operation: isView ? 'drop-view' : 'drop', tableName: name, schema })}
                />
              ))}
            </SidebarObjectGroup>
            {!isDocumentDb && !isKeyValueDb && grouped.views.length > 0 && (
              <SidebarObjectGroup label="Views" icon={Eye} count={grouped.views.length}>
                {grouped.views.map((table) => (
                  <SidebarTableNode
                    key={`${table.schema ?? ""}.${table.name}`}
                    table={table}
                    expanded={expandedTables.has(table.name)}
                    onToggle={() => toggleTable(table.name)}
                    sessionId={sessionId ?? null}
                    isActive={isTableActive(table.name, table.schema)}
                    onViewStructure={onViewStructure}
                    onOpenTable={onOpenTable}
                    onOpenPreviewTable={onOpenPreviewTable}
                    onTruncateTable={(name, schema) => setTableOpDialog({ operation: 'truncate', tableName: name, schema })}
                    onDeleteAllRecords={(name, schema) => setTableOpDialog({ operation: 'delete-all', tableName: name, schema })}
                    onDropTable={(name, schema, isView) => setTableOpDialog({ operation: isView ? 'drop-view' : 'drop', tableName: name, schema })}
                  />
                ))}
              </SidebarObjectGroup>
            )}
            {!isDocumentDb && !isKeyValueDb && routineCatalog?.supported && (
              <>
                <SidebarObjectGroup label="Functions" icon={Braces} count={routinesGrouped.functions.length}>
                  {routinesGrouped.functions.map((routine) => (
                    <SidebarRoutineNode
                      key={`${routine.schema ?? ""}.${routine.name}.${routine.signature ?? ""}`}
                      routine={routine}
                      onExecute={setExecuteRoutine}
                      onViewSource={setViewSourceRoutine}
                    />
                  ))}
                </SidebarObjectGroup>
                <SidebarObjectGroup label="Procedures" icon={ScrollText} count={routinesGrouped.procedures.length}>
                  {routinesGrouped.procedures.map((routine) => (
                    <SidebarRoutineNode
                      key={`${routine.schema ?? ""}.${routine.name}.${routine.signature ?? ""}`}
                      routine={routine}
                      onExecute={setExecuteRoutine}
                      onViewSource={setViewSourceRoutine}
                    />
                  ))}
                </SidebarObjectGroup>
              </>
            )}
          </>
        )}
        {!isLoading && sessionId && routineCatalog && !routineCatalog.supported && (
          <div className="px-3 py-2 text-xs text-text-muted">
            {routineCatalog.reason ?? "Functions and procedures are not supported for this database."}
          </div>
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

      {sessionId && executeRoutine && (
        <ProcedureExecuteDialog
          open={!!executeRoutine}
          routine={executeRoutine}
          sessionId={sessionId}
          onClose={() => setExecuteRoutine(null)}
        />
      )}

      {sessionId && viewSourceRoutine && (
        <ProcedureSourcePanel
          open={!!viewSourceRoutine}
          routine={viewSourceRoutine}
          sessionId={sessionId}
          onClose={() => setViewSourceRoutine(null)}
        />
      )}

      {sessionId && tableOpDialog && (
        <TableOperationDialog
          open={!!tableOpDialog}
          operation={tableOpDialog.operation}
          tableName={tableOpDialog.tableName}
          onCancel={() => setTableOpDialog(null)}
          onConfirm={async () => {
            if (!sessionId) return;
            const { operation, tableName, schema } = tableOpDialog;
            setTableOpDialog(null);

            try {
              // Quoting comes from the backend (`quote_identifier`), so
              // MariaDB and embedded quote characters are handled the same
              // way as in every other generated statement.
              const sql = await commands.generateTableOperationSql(sessionId, {
                operation,
                table: tableName,
                schema: schema ?? null,
              });

              // Executed through the query store, not `executeQuery`: that is
              // the single place Safe Mode is enforced.
              await useQueryStore
                .getState()
                .execute(sessionId, sql, undefined, safeModeLevel);

              const { error, pendingSafeCheck } = useQueryStore.getState();
              if (error) {
                window.alert(`Operation failed: ${error}`);
                return;
              }
              if (pendingSafeCheck) {
                // Safe Mode is asking the user to confirm; refresh once the
                // statement it is holding has actually finished.
                refreshSchemaAfterSafeCheck(sessionId, fetchSchema);
                return;
              }
              // Refresh schema to reflect changes (e.g., dropped table)
              void fetchSchema(sessionId);
            } catch (err) {
              // Show error in alert since this is a sidebar action
              const msg = extractErrorMessage(err);
              window.alert(`Operation failed: ${msg}`);
            }
          }}
        />
      )}

      {dbContextMenu && (
        <div
          ref={dbContextRef}
          style={{ top: dbContextMenu.y, left: dbContextMenu.x }}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded border border-border bg-surface-elevated py-0.5 shadow-lg"
        >
          <button
            onClick={() => {
              if (sessionId) void fetchSchema(sessionId);
              setDbContextMenu(null);
            }}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs font-medium text-text-primary"
          >
            {t("sidebar.refreshTables")}
          </button>
          <button
            onClick={() => {
              if (sessionId) void fetchDatabases(sessionId);
              setDbContextMenu(null);
            }}
            className="menu-item-button w-full px-3 py-1.5 text-left text-xs text-text-primary"
          >
            {t("sidebar.refreshDatabases")}
          </button>
        </div>
      )}
    </nav>
  );
}
