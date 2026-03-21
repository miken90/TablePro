import { useCallback, useEffect, useMemo } from "react";
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
import { StatusBar } from "./StatusBar";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useQueryStore } from "../../stores/queryStore";
import { useFilterStore } from "../../stores/filterStore";
import {
  useLayoutStore,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  EDITOR_MIN_PERCENT,
  INSPECTOR_MIN,
  INSPECTOR_MAX,
} from "../../stores/layoutStore";
import { useCommandStore } from "../../hooks/useCommandRegistry";
import { useTheme } from "../../hooks/useTheme";
import { useAutoUpdater } from "../../hooks/useAutoUpdater";
import { useResizable } from "../../hooks/useResizable";

/** Combine filter clause + quick-search clause with AND */
function combineWhereClauses(filterClause: string, quickSearchClause: string): string {
  const parts = [filterClause, quickSearchClause].filter(Boolean);
  if (parts.length === 0) return "";
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

  // Layout store
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const editorHeightPercent = useLayoutStore((s) => s.editorHeightPercent);
  const quickSwitcherOpen = useLayoutStore((s) => s.quickSwitcherOpen);
  const structureTarget = useLayoutStore((s) => s.structureTarget);
  const settingsOpen = useLayoutStore((s) => s.settingsOpen);
  const viewMode = useLayoutStore((s) => s.viewMode);
  const activeTableContext = useLayoutStore((s) => s.activeTableContext);
  const filterVisible = useLayoutStore((s) => s.filterVisible);
  const filterColumns = useLayoutStore((s) => s.filterColumns);
  const inspectorVisible = useLayoutStore((s) => s.inspectorVisible);
  const inspectorWidth = useLayoutStore((s) => s.inspectorWidth);
  const selectedRowIndex = useLayoutStore((s) => s.selectedRowIndex);
  const historyVisible = useLayoutStore((s) => s.historyVisible);
  const helpOpen = useLayoutStore((s) => s.helpOpen);
  const commandPaletteOpen = useLayoutStore((s) => s.commandPaletteOpen);

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

  // Resizable hooks
  const { onMouseDown: handleSidebarResize } = useResizable({
    direction: "horizontal",
    min: SIDEBAR_MIN,
    max: SIDEBAR_MAX,
    currentValue: sidebarWidth,
    onResize: useLayoutStore.getState().setSidebarWidth,
  });

  const { onMouseDown: handleEditorResize } = useResizable({
    direction: "vertical",
    min: EDITOR_MIN_PERCENT,
    max: 80,
    containerSelector: ".editor-results-container",
    onResize: useLayoutStore.getState().setEditorHeightPercent,
  });

  const { onMouseDown: handleInspectorResize } = useResizable({
    direction: "horizontal",
    min: INSPECTOR_MIN,
    max: INSPECTOR_MAX,
    currentValue: inspectorWidth,
    invert: true,
    onResize: useLayoutStore.getState().setInspectorWidth,
  });

  // Stable tabId for the filter store
  const filterTabId = useMemo(() => {
    if (viewMode === "table-browse" && activeTableContext?.tableName) {
      return `table:${activeTableContext.tableName}`;
    }
    return activeTabId ?? "default";
  }, [viewMode, activeTableContext, activeTabId]);

  // Derive activeWhereClause from filterStore
  const filterByTab = useFilterStore((s) => s.byTab);
  const activeWhereClause = useMemo(() => {
    const tab = filterByTab[filterTabId];
    if (!tab) return "";
    return combineWhereClauses(tab.appliedFilterClause, tab.quickSearchClause);
  }, [filterByTab, filterTabId]);

  // Keyboard shortcuts
  useEffect(() => {
    const ls = useLayoutStore.getState();
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        ls.setQuickSwitcherOpen(!useLayoutStore.getState().quickSwitcherOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        ls.setSettingsOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        useLayoutStore.getState().toggleFilter();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") {
        e.preventDefault();
        useLayoutStore.getState().toggleInspector();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        useLayoutStore.getState().toggleHistory();
      }
      if (e.key === "F1") {
        e.preventDefault();
        ls.setHelpOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        ls.setCommandPaletteOpen(!useLayoutStore.getState().commandPaletteOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Register core commands
  useEffect(() => {
    const ls = useLayoutStore.getState();
    const cmds = [
      {
        id: "nav.toggleSidebar",
        label: "Toggle Sidebar",
        shortcut: "Ctrl+B",
        category: "Navigation" as const,
        action: () => ls.toggleSidebar(),
      },
      {
        id: "nav.openSettings",
        label: "Open Settings",
        shortcut: "Ctrl+,",
        category: "Navigation" as const,
        action: () => ls.setSettingsOpen(true),
      },
      {
        id: "nav.quickSwitcher",
        label: "Quick Switcher",
        shortcut: "Ctrl+K",
        category: "Navigation" as const,
        action: () => ls.setQuickSwitcherOpen(!useLayoutStore.getState().quickSwitcherOpen),
      },
      {
        id: "nav.toggleHistory",
        label: "Toggle Query History",
        shortcut: "Ctrl+H",
        category: "Navigation" as const,
        action: () => ls.toggleHistory(),
      },
      {
        id: "query.run",
        label: "Run Query",
        shortcut: "Ctrl+Enter",
        category: "Query" as const,
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
        id: "query.formatSql",
        label: "Format SQL",
        shortcut: "Ctrl+Shift+F",
        category: "Query" as const,
        action: () => window.dispatchEvent(new CustomEvent("tablepro:format-sql")),
      },
      {
        id: "edit.newTab",
        label: "New Tab",
        shortcut: "Ctrl+N",
        category: "Edit" as const,
        action: () => useEditorStore.getState().addTab(),
      },
      {
        id: "edit.closeTab",
        label: "Close Tab",
        shortcut: "Ctrl+W",
        category: "Edit" as const,
        action: () => {
          const { activeTabId: tid } = useEditorStore.getState();
          if (tid) useEditorStore.getState().closeTab(tid);
        },
      },
      {
        id: "view.toggleFilterBar",
        label: "Toggle Filter Bar",
        shortcut: "Ctrl+Shift+F",
        category: "View" as const,
        action: () => ls.toggleFilter(),
      },
      {
        id: "view.toggleInspector",
        label: "Toggle Inspector",
        shortcut: "Ctrl+Shift+I",
        category: "View" as const,
        action: () => ls.toggleInspector(),
      },
    ];
    cmds.forEach(registerCommand);
  }, [registerCommand]);

  // Fetch columns when active table changes
  useEffect(() => {
    if (!activeTableContext?.tableName || !selectedConnectionId) {
      useLayoutStore.getState().setFilterColumns([]);
      return;
    }
    const sid = getSessionId(selectedConnectionId);
    if (!sid) return;
    fetchColumns(sid, activeTableContext.tableName, activeTableContext.schema ?? undefined)
      .then((cols) => useLayoutStore.getState().setFilterColumns(cols))
      .catch(() => useLayoutStore.getState().setFilterColumns([]));
  }, [activeTableContext, selectedConnectionId, getSessionId, fetchColumns]);

  const handleQuickSwitcherSelect = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        useLayoutStore.getState().openTable(tableName, schema);
      }
    },
    [selectedConnectionId],
  );

  const handleOpenTable = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        useLayoutStore.getState().openTable(tableName, schema);
      }
    },
    [selectedConnectionId],
  );

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
      useLayoutStore.getState().switchToQueryMode();
      void useQueryStore.getState().execute(sid, selectQuery);
    },
    [selectedConnectionId, getSessionId, addPreviewTab, updateTabContent, setQueryText],
  );

  const handleHistorySelect = useCallback(
    (query: string) => {
      if (activeTabId) {
        updateTabContent(activeTabId, query);
      } else {
        const tabId = addTab("Query");
        updateTabContent(tabId, query);
      }
      setQueryText(query);
      useLayoutStore.getState().switchToQueryMode();
    },
    [activeTabId, addTab, updateTabContent, setQueryText],
  );

  const queryResult = useQueryStore((s) => s.result);
  const inspectorResult = viewMode === "table-browse" ? null : queryResult;
  const selectedRow =
    inspectorResult && selectedRowIndex !== null
      ? (inspectorResult.rows[selectedRowIndex] ?? null)
      : null;
  const inspectorColumns = inspectorResult?.columns ?? [];

  const sessionId = selectedConnectionId ? getSessionId(selectedConnectionId) : undefined;
  const isConnected = !!selectedConnectionId;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base">
      <Toolbar
        onToggleSidebar={() => useLayoutStore.getState().toggleSidebar()}
        onOpenSettings={() => useLayoutStore.getState().setSettingsOpen(true)}
        onToggleHistory={() => useLayoutStore.getState().toggleHistory()}
        onRunQuery={() => useLayoutStore.getState().switchToQueryMode()}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0 overflow-hidden">
              <Sidebar
                onViewStructure={(t, s) => useLayoutStore.getState().openStructure(t, s)}
                onOpenTable={handleOpenTable}
                onOpenPreviewTable={handleOpenPreviewTable}
              />
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
              onClose={() => useLayoutStore.getState().closeStructure()}
            />
          ) : !isConnected ? (
            <WelcomeView />
          ) : viewMode === "table-browse" && activeTableContext ? (
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
                  onRowSelect={(i) => useLayoutStore.getState().setSelectedRowIndex(i)}
                  onOpenQueryEditor={() => useLayoutStore.getState().switchToQueryMode()}
                />
              </div>
            </>
          ) : (
            <>
              <EditorTabBar />
              {filterVisible && (
                <FilterPanel tabId={filterTabId} columns={filterColumns} />
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
                    onRowSelect={(i) => useLayoutStore.getState().setSelectedRowIndex(i)}
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
                onClose={() => useLayoutStore.getState().toggleInspector()}
              />
            </div>
          </>
        )}

        {/* History slide-over overlay */}
        {historyVisible && isConnected && (
          <>
            <div
              className="absolute inset-0 z-20 bg-black/20"
              onClick={() => useLayoutStore.getState().toggleHistory()}
            />
            <div
              className="absolute right-0 top-0 h-full w-[360px] transform shadow-panel transition-transform duration-150"
              style={{ zIndex: 21 }}
            >
              <HistoryPanel
                onSelectQuery={handleHistorySelect}
                onClose={() => useLayoutStore.getState().toggleHistory()}
              />
            </div>
          </>
        )}
      </div>

      <StatusBar />

      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => useLayoutStore.getState().setQuickSwitcherOpen(false)}
        onSelectTable={handleQuickSwitcherSelect}
      />

      {settingsOpen && (
        <SettingsView onClose={() => useLayoutStore.getState().setSettingsOpen(false)} />
      )}

      {availableUpdate && shouldShowNotification && (
        <UpdateNotification
          update={availableUpdate}
          isInstalling={isInstalling}
          downloadedBytes={downloadedBytes}
          totalBytes={totalBytes}
          error={updateError}
          onUpdateNow={() => void installUpdate()}
          onLater={dismissUpdate}
        />
      )}

      <ShortcutsHelp
        open={helpOpen}
        onClose={() => useLayoutStore.getState().setHelpOpen(false)}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={(open) => useLayoutStore.getState().setCommandPaletteOpen(open)}
      />

      <QueryAnnouncer />
    </div>
  );
}
