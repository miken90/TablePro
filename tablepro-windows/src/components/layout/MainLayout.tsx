import { useState, useCallback, useEffect, useMemo } from "react";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { EditorTabBar } from "../editor/EditorTabBar";
import { SqlEditor } from "../editor/sql-editor";
import { ResultPanel } from "../grid/ResultPanel";
import { WelcomeView } from "../connection/WelcomeView";
import { QuickSwitcher } from "./quick-switcher";
import { TableStructureView } from "../structure/table-structure-view";
import { SettingsView } from "../settings/settings-view";
import { FilterPanel } from "../filter/filter-panel";
import { InspectorPanel } from "../inspector/inspector-panel";
import { HistoryPanel } from "../history/HistoryPanel";
import { ShortcutsHelp } from "../shared/ShortcutsHelp";
import { UpdateNotification } from "../shared/update-notification";
import { CommandPalette } from "../shared/command-palette";
import { QueryAnnouncer } from "../shared/query-announcer";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useQueryStore } from "../../stores/queryStore";
import { useFilterStore } from "../../stores/filterStore";
import { useCommandStore } from "../../hooks/useCommandRegistry";
import { useTheme } from "../../hooks/useTheme";
import { useAutoUpdater } from "../../hooks/useAutoUpdater";
import type { ColumnInfo } from "../../types/query";

const SIDEBAR_DEFAULT = 240;
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const EDITOR_MIN_PERCENT = 20;
const INSPECTOR_DEFAULT = 300;
const INSPECTOR_MIN = 200;
const INSPECTOR_MAX = 500;

interface StructureTarget {
  tableName: string;
  schema?: string | null;
}

type ViewMode = 'query' | 'table-browse';

interface TableContext {
  tableName: string;
  schema?: string | null;
}

/** Combine filter clause + quick-search clause with AND */
function combineWhereClauses(filterClause: string, quickSearchClause: string): string {
  const parts = [filterClause, quickSearchClause].filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `(${parts[0]}) AND (${parts[1]})`;
}

export function MainLayout() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const addPreviewTab = useEditorStore((s) => s.addPreviewTab);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const fetchColumns = useSchemaStore((s) => s.fetchColumns);

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorHeightPercent, setEditorHeightPercent] = useState(50);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [structureTarget, setStructureTarget] = useState<StructureTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('query');
  const [activeTableContext, setActiveTableContext] = useState<TableContext | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterColumns, setFilterColumns] = useState<ColumnInfo[]>([]);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const setQueryText = useQueryStore((s) => s.setQueryText);
  const registerCommand = useCommandStore((s) => s.registerCommand);
  const {
    availableUpdate,
    shouldShowNotification,
    isInstalling,
    downloadedBytes,
    totalBytes,
    error: updateError,
    installUpdate,
    dismissUpdate,
  } = useAutoUpdater();

  useTheme();

  // Stable tabId for the filter store: table-browse uses "table:{name}", query uses activeTabId
  const filterTabId = useMemo(() => {
    if (viewMode === 'table-browse' && activeTableContext?.tableName) {
      return `table:${activeTableContext.tableName}`;
    }
    return activeTabId ?? 'default';
  }, [viewMode, activeTableContext, activeTabId]);

  // Derive activeWhereClause from filterStore (filter panel + quick search combined)
  const filterByTab = useFilterStore((s) => s.byTab);
  const activeWhereClause = useMemo(() => {
    const tab = filterByTab[filterTabId];
    if (!tab) return '';
    return combineWhereClauses(tab.appliedFilterClause, tab.quickSearchClause);
  }, [filterByTab, filterTabId]);

  // Keyboard shortcuts: Ctrl+K, Ctrl+,, Ctrl+Shift+F, Ctrl+Shift+P
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setFilterVisible((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") {
        e.preventDefault();
        setInspectorVisible((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setHistoryVisible((v) => !v);
      }
      if (e.key === "F1") {
        e.preventDefault();
        setHelpOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Register core commands in the command palette
  useEffect(() => {
    const cmds = [
      // Navigation
      {
        id: 'nav.toggleSidebar',
        label: 'Toggle Sidebar',
        shortcut: 'Ctrl+B',
        category: 'Navigation' as const,
        action: () => setSidebarCollapsed((v) => !v),
      },
      {
        id: 'nav.openSettings',
        label: 'Open Settings',
        shortcut: 'Ctrl+,',
        category: 'Navigation' as const,
        action: () => setSettingsOpen(true),
      },
      {
        id: 'nav.quickSwitcher',
        label: 'Quick Switcher',
        shortcut: 'Ctrl+K',
        category: 'Navigation' as const,
        action: () => setQuickSwitcherOpen((v) => !v),
      },
      {
        id: 'nav.toggleHistory',
        label: 'Toggle Query History',
        shortcut: 'Ctrl+H',
        category: 'Navigation' as const,
        action: () => setHistoryVisible((v) => !v),
      },
      // Query
      {
        id: 'query.run',
        label: 'Run Query',
        shortcut: 'Ctrl+Enter',
        category: 'Query' as const,
        action: () => {
          const { queryText } = useQueryStore.getState();
          const { selectedConnectionId: connId } = useConnectionStore.getState();
          if (connId) {
            const sid = useConnectionStore.getState().getSessionId(connId);
            if (sid) void useQueryStore.getState().execute(sid, queryText);
          }
        },
      },
      {
        id: 'query.formatSql',
        label: 'Format SQL',
        shortcut: 'Ctrl+Shift+F',
        category: 'Query' as const,
        action: () => {
          // Dispatch a custom event that SqlEditor can listen to
          window.dispatchEvent(new CustomEvent('tablepro:format-sql'));
        },
      },
      // Edit
      {
        id: 'edit.newTab',
        label: 'New Tab',
        shortcut: 'Ctrl+N',
        category: 'Edit' as const,
        action: () => useEditorStore.getState().addTab(),
      },
      {
        id: 'edit.closeTab',
        label: 'Close Tab',
        shortcut: 'Ctrl+W',
        category: 'Edit' as const,
        action: () => {
          const { activeTabId: tid } = useEditorStore.getState();
          if (tid) useEditorStore.getState().closeTab(tid);
        },
      },
      // View
      {
        id: 'view.toggleFilterBar',
        label: 'Toggle Filter Bar',
        shortcut: 'Ctrl+Shift+F',
        category: 'View' as const,
        action: () => setFilterVisible((v) => !v),
      },
      {
        id: 'view.toggleInspector',
        label: 'Toggle Inspector',
        shortcut: 'Ctrl+Shift+I',
        category: 'View' as const,
        action: () => setInspectorVisible((v) => !v),
      },
    ];
    cmds.forEach(registerCommand);
  }, [registerCommand]);

  // Fetch columns when active table changes (for filter panel)
  useEffect(() => {
    if (!activeTableContext?.tableName || !selectedConnectionId) {
      setFilterColumns([]);
      return;
    }
    const sid = getSessionId(selectedConnectionId);
    if (!sid) return;
    fetchColumns(sid, activeTableContext.tableName, activeTableContext.schema ?? undefined)
      .then(setFilterColumns)
      .catch(() => setFilterColumns([]));
  }, [activeTableContext, selectedConnectionId, getSessionId, fetchColumns]);

  const handleSidebarResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      const onMove = (mv: MouseEvent) => {
        const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + mv.clientX - startX));
        setSidebarWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [sidebarWidth]
  );

  const handleEditorResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = (e.currentTarget as HTMLElement).closest(
      ".editor-results-container"
    ) as HTMLElement;
    if (!container) return;
    const onMove = (mv: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = Math.min(
        80,
        Math.max(EDITOR_MIN_PERCENT, ((mv.clientY - rect.top) / rect.height) * 100)
      );
      setEditorHeightPercent(pct);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handleViewStructure = useCallback(
    (tableName: string, schema?: string | null) => {
      setStructureTarget({ tableName, schema });
    },
    []
  );

  const handleQuickSwitcherSelect = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        setActiveTableContext({ tableName, schema });
        setViewMode('table-browse');
        setStructureTarget(null);
      }
    },
    [selectedConnectionId]
  );

  const handleOpenTable = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        setActiveTableContext({ tableName, schema });
        setViewMode('table-browse');
        setStructureTarget(null);
      }
    },
    [selectedConnectionId]
  );

  /**
   * Single-click table in sidebar → open as a preview SQL tab.
   * Generates SELECT * for the table and opens it as a temporary (preview) tab.
   * Tab is replaced if another table is single-clicked, and becomes permanent on edit.
   * Ctrl+click in sidebar calls handleOpenTable (permanent tab) instead.
   */
  const handleOpenPreviewTable = useCallback(
    (tableName: string, schema?: string | null) => {
      if (!selectedConnectionId) return;
      const sid = getSessionId(selectedConnectionId);
      if (!sid) return;
      const qualifiedName = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
      const selectQuery = `SELECT * FROM ${qualifiedName} LIMIT 100;`;
      const tabId = addPreviewTab(tableName);
      updateTabContent(tabId, selectQuery);
      setQueryText(selectQuery);
      // Switch to query editor so the preview tab is visible
      setViewMode('query');
      setStructureTarget(null);
      // Auto-execute so records display immediately
      void useQueryStore.getState().execute(sid, selectQuery);
    },
    [selectedConnectionId, getSessionId, addPreviewTab, updateTabContent, setQueryText]
  );

  const handleSwitchToQueryMode = useCallback(() => {
    setViewMode('query');
    setActiveTableContext(null);
  }, []);

  const handleInspectorResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = inspectorWidth;
      const onMove = (mv: MouseEvent) => {
        const next = Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, startWidth - (mv.clientX - startX)));
        setInspectorWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [inspectorWidth]
  );

  const handleRowSelect = useCallback((rowIndex: number | null) => {
    setSelectedRowIndex(rowIndex);
  }, []);

  const handleHistorySelect = useCallback((query: string) => {
    if (activeTabId) {
      updateTabContent(activeTabId, query);
    } else {
      const tabId = addTab('Query');
      updateTabContent(tabId, query);
    }
    setQueryText(query);
    setViewMode('query');
    setActiveTableContext(null);
  }, [activeTabId, addTab, updateTabContent, setQueryText]);

  const queryResult = useQueryStore((s) => s.result);
  const inspectorResult = viewMode === 'table-browse' ? null : queryResult;
  const selectedRow = inspectorResult && selectedRowIndex !== null ? inspectorResult.rows[selectedRowIndex] ?? null : null;
  const inspectorColumns = inspectorResult?.columns ?? [];

  const sessionId = selectedConnectionId ? getSessionId(selectedConnectionId) : undefined;
  const isConnected = !!selectedConnectionId;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base">
      <Toolbar
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleHistory={() => setHistoryVisible((v) => !v)}
        onRunQuery={handleSwitchToQueryMode}
      />

      <div className="flex flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0 overflow-hidden">
              <Sidebar onViewStructure={handleViewStructure} onOpenTable={handleOpenTable} onOpenPreviewTable={handleOpenPreviewTable} />
            </div>
            <div
              className="w-1 cursor-col-resize bg-border-subtle hover:bg-accent-blue"
              onMouseDown={handleSidebarResize}
              aria-hidden="true"
            />
          </>
        )}

        <main id="main-content" className="flex flex-1 flex-col overflow-hidden">
          {structureTarget && selectedConnectionId && getSessionId(selectedConnectionId) ? (
            <TableStructureView
              sessionId={getSessionId(selectedConnectionId)!}
              tableName={structureTarget.tableName}
              schema={structureTarget.schema ?? undefined}
              onClose={() => setStructureTarget(null)}
            />
          ) : !isConnected ? (
            <WelcomeView />
          ) : viewMode === 'table-browse' && activeTableContext ? (
            /* ── Table Browse Mode: full-height data grid, no editor ── */
            <>
              {filterVisible && (
                <FilterPanel
                  tabId={filterTabId}
                  tableName={activeTableContext.tableName}
                  columns={filterColumns}
                />
              )}
              <div className="flex-1 overflow-hidden">
                <ResultPanel
                  tabId={filterTabId}
                  tableName={activeTableContext.tableName}
                  schema={activeTableContext.schema}
                  sessionId={sessionId}
                  activeWhereClause={activeWhereClause}
                  quickSearchColumns={filterColumns}
                  onRowSelect={handleRowSelect}
                  onOpenQueryEditor={handleSwitchToQueryMode}
                />
              </div>
            </>
          ) : (
            /* ── Query Editor Mode: editor on top, results below ── */
            <>
              <EditorTabBar />
              {filterVisible && (
                <FilterPanel
                  tabId={filterTabId}
                  columns={filterColumns}
                />
              )}
              <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
                <div style={{ height: `${editorHeightPercent}%` }} className="overflow-hidden">
                  <SqlEditor />
                </div>
                <div
                  className="h-1 cursor-row-resize bg-border-subtle hover:bg-accent-blue"
                  onMouseDown={handleEditorResize}
                />
                <div className="flex-1 overflow-hidden">
                  <ResultPanel
                    sessionId={sessionId}
                    onRowSelect={handleRowSelect}
                  />
                </div>
              </div>
            </>
          )}
        </main>

        {inspectorVisible && isConnected && (
          <>
            <div
              className="w-1 cursor-col-resize bg-border-subtle hover:bg-accent-blue"
              onMouseDown={handleInspectorResize}
            />
            <div style={{ width: inspectorWidth }} className="flex-shrink-0 overflow-hidden">
              <InspectorPanel
                columns={inspectorColumns}
                row={selectedRow}
                onClose={() => setInspectorVisible(false)}
              />
            </div>
          </>
        )}

        {historyVisible && isConnected && (
          <>
            <div className="w-px bg-border-subtle" />
            <div style={{ width: 320 }} className="flex-shrink-0 overflow-hidden">
              <HistoryPanel
                onSelectQuery={handleHistorySelect}
                onClose={() => setHistoryVisible(false)}
              />
            </div>
          </>
        )}
      </div>

      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        onSelectTable={handleQuickSwitcherSelect}
      />

      {settingsOpen && <SettingsView onClose={() => setSettingsOpen(false)} />}

      {availableUpdate && shouldShowNotification && (
        <UpdateNotification
          update={availableUpdate}
          isInstalling={isInstalling}
          downloadedBytes={downloadedBytes}
          totalBytes={totalBytes}
          error={updateError}
          onUpdateNow={() => {
            void installUpdate();
          }}
          onLater={dismissUpdate}
        />
      )}

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {/* Screen reader announcements for dynamic state changes */}
      <QueryAnnouncer />
    </div>
  );
}
