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
import { useQueryStore } from "../../stores/queryStore";
import {
  useLayoutStore,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  EDITOR_MIN_PERCENT,
  INSPECTOR_MIN,
  INSPECTOR_MAX,
} from "../../stores/layoutStore";
import { useTheme } from "../../hooks/useTheme";
import { useAutoUpdater } from "../../hooks/useAutoUpdater";
import { useResizable } from "../../hooks/useResizable";
import { useMainLayoutShortcuts } from "../../hooks/useMainLayoutShortcuts";
import { useMainLayoutCommands } from "../../hooks/useMainLayoutCommands";
import { useFilterContext } from "../../hooks/useFilterContext";
import { useTableCallbacks } from "../../hooks/useTableCallbacks";

export function MainLayout() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const activeTabId = useEditorStore((s) => s.activeTabId);

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
  useMainLayoutShortcuts();
  useMainLayoutCommands();

  const { filterTabId, activeWhereClause } = useFilterContext(viewMode, activeTableContext, activeTabId);
  const {
    handleQuickSwitcherSelect,
    handleOpenTable,
    handleOpenPreviewTable,
    handleHistorySelect,
  } = useTableCallbacks();

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
              className="absolute right-0 top-0 h-full w-[360px] transform shadow-panel slide-in-right"
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
