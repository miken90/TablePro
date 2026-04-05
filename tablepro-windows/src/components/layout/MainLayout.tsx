import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { EditorTabBar } from "../editor/EditorTabBar";
import { SqlEditor } from "../editor/sql-editor";
import { EditorStatusBar } from "../editor/editor-status-bar";
import { ResultPanel } from "../grid/ResultPanel";
import { ContextualBar } from "../grid/contextual-bar";
import { WelcomeView } from "../connection/WelcomeView";
import { QuickSwitcher } from "./quick-switcher";
import { TableStructureView } from "../structure/table-structure-view";
import { SettingsView } from "../settings/settings-view";
import { FilterPanel } from "../filter/filter-panel";
import { InspectorPanel } from "../inspector/inspector-panel";
import { HistoryPanel } from "../history/HistoryPanel";
import { AiChatPanel } from "../ai/ai-chat-panel";
import { MongodbQueryPanel } from "../mongodb/mongodb-query-panel";
import { RedisCommandPanel } from "../redis/redis-command-panel";
import { ShortcutsHelp } from "../shared/ShortcutsHelp";
import { UnsavedChangesDialog } from "../shared/unsaved-changes-dialog";
import { UpdateNotification } from "../shared/update-notification";
import { CommandPalette } from "../shared/command-palette";
import { QueryAnnouncer } from "../shared/query-announcer";
import { StatusBar } from "./StatusBar";
import { EditorViewProvider } from "../../contexts/editor-view-context";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../../stores/queryStore";
import { ExplainPanel } from "../editor/explain-panel";
import { useInspectorStore } from "../../stores/inspectorStore";
import { useChangeStore } from "../../stores/changeStore";
import { useSchemaStore } from "../../stores/schemaStore";
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
import { useState, useCallback, useRef, useEffect } from "react";

export function MainLayout() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const connections = useConnectionStore((s) => s.connections);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const capabilities = useSchemaStore((s) => s.capabilities);
  const isDocumentDb = capabilities.supportsCollections && !capabilities.supportsSqlEditor;
  const activeConnection = selectedConnectionId ? connections.get(selectedConnectionId) : undefined;
  const isKeyValueDb = activeConnection?.config?.dbType === "redis";

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
  const aiChatVisible = useLayoutStore((s) => s.aiChatVisible);
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

  // Load persisted tab state from backend on mount
  useEffect(() => {
    void useEditorStore.getState().initFromBackend();
  }, []);

  const { filterTabId, activeWhereClause } = useFilterContext(viewMode, activeTableContext, activeTabId);
  const {
    handleQuickSwitcherSelect,
    handleOpenTable,
    handleOpenPreviewTable,
    handleHistorySelect,
  } = useTableCallbacks();

  // --- Unsaved changes dialog for tab switching ---
  const [unsavedDialog, setUnsavedDialog] = useState<{ targetTabId: string } | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  const requestSaveRef = useRef<(() => void) | null>(null);
  const addRowRef = useRef<(() => void) | null>(null);

  /** Called before switching tabs. Returns false to block the switch. */
  const handleBeforeTabSwitch = useCallback((targetTabId: string): boolean => {
    const hasChanges = useChangeStore.getState().hasChanges;
    if (!hasChanges) {
      return true; // No changes — allow switch
    }
    // Block switch and show dialog
    setUnsavedDialog({ targetTabId });
    return false;
  }, []);

  /** Perform the actual tab + view mode switch. */
  const performTabSwitch = useCallback((tabId: string) => {
    const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    useEditorStore.getState().setActiveTab(tabId);
    if (tab.type === "query") {
      useLayoutStore.getState().switchToQueryMode();
    } else if (tab.type === "table" && tab.tableName) {
      useLayoutStore.getState().openTable(tab.tableName, tab.tableSchema);
    }
  }, []);

  /** After tab bar switches a tab (already allowed), reconcile viewMode. */
  const handleTabActivated = useCallback(() => {
    const tabId = useEditorStore.getState().activeTabId;
    if (!tabId) return;
    const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.type === "query") {
      useLayoutStore.getState().switchToQueryMode();
    } else if (tab.type === "table" && tab.tableName) {
      // Update activeTableContext + changeStore scope (openTable handles both)
      useLayoutStore.getState().openTable(tab.tableName, tab.tableSchema);
    }
  }, []);

  const handleUnsavedSave = useCallback(async () => {
    if (!unsavedDialog) return;
    const targetTabId = unsavedDialog.targetTabId;
    // Trigger save via the pending save ref (set by ResultPanel's useChangeTracking)
    if (pendingSaveRef.current) {
      try {
        await pendingSaveRef.current();
        setUnsavedDialog(null);
        performTabSwitch(targetTabId);
      } catch {
        // Save failed — keep dialog closed, stay on current tab (toast shows error)
        setUnsavedDialog(null);
      }
    }
  }, [unsavedDialog, performTabSwitch]);

  const handleUnsavedDiscard = useCallback(() => {
    if (!unsavedDialog) return;
    const targetTabId = unsavedDialog.targetTabId;
    useChangeStore.getState().clear();
    setUnsavedDialog(null);
    performTabSwitch(targetTabId);
  }, [unsavedDialog, performTabSwitch]);

  const handleUnsavedCancel = useCallback(() => {
    setUnsavedDialog(null);
  }, []);

  /** After a tab is closed, reconcile viewMode based on the new active tab. */
  const handleAfterClose = useCallback((newActiveTabId: string | null) => {
    if (!newActiveTabId) return;
    const tab = useEditorStore.getState().tabs.find((t) => t.id === newActiveTabId);
    if (!tab) return;
    if (tab.type === "query") {
      useLayoutStore.getState().switchToQueryMode();
    } else if (tab.type === "table" && tab.tableName) {
      useLayoutStore.getState().openTable(tab.tableName, tab.tableSchema);
    }
  }, []);

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
  const explainResult = useQueryStore((s) => s.explainResult);
  const inspectorStoreColumns = useInspectorStore((s) => s.columns);
  const inspectorStoreRow = useInspectorStore((s) => s.row);

  // Use inspectorStore data if available (set by ResultPanel on row select),
  // otherwise fall back to query result with selectedRowIndex for query mode
  const inspectorColumns = inspectorStoreRow ? inspectorStoreColumns : (queryResult?.columns ?? []);
  const selectedRow = inspectorStoreRow
    ?? (queryResult && selectedRowIndex !== null ? (queryResult.rows[selectedRowIndex] ?? null) : null);

  const sessionId = resolveActiveQuerySessionId();
  const isConnected = !!selectedConnectionId;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base">
      <EditorViewProvider>
      <Toolbar
        onToggleSidebar={() => useLayoutStore.getState().toggleSidebar()}
        onOpenSettings={() => useLayoutStore.getState().setSettingsOpen(true)}
        onToggleHistory={() => useLayoutStore.getState().toggleHistory()}
        onToggleAiChat={() => useLayoutStore.getState().toggleAiChat()}
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
              className="group w-1.5 cursor-col-resize bg-border-subtle hover:bg-accent-blue flex flex-col items-center justify-center"
              onMouseDown={handleSidebarResize}
              aria-hidden="true"
            >
              <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-70">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </div>
            </div>
          </>
        )}

        <main id="main-content" className="flex flex-1 flex-col overflow-hidden">
          {!isDocumentDb && !isKeyValueDb && structureTarget && selectedConnectionId && getSessionId(selectedConnectionId) ? (
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
              <EditorTabBar
                onTabActivate={handleTabActivated}
                onBeforeTabSwitch={handleBeforeTabSwitch}
                onAfterClose={handleAfterClose}
              />
              <ContextualBar
                tabId={filterTabId}
                tableName={activeTableContext.tableName}
                columns={filterColumns}
                onSave={isDocumentDb ? () => {} : () => requestSaveRef.current?.()}
                onAddRow={isDocumentDb ? undefined : () => addRowRef.current?.()}
              />
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
                  onSaveRef={pendingSaveRef}
                  onRequestSaveRef={requestSaveRef}
                  onAddRowRef={addRowRef}
                  hideChangeToolbar
                />
              </div>
            </>
          ) : (
            <>
              <EditorTabBar
                onTabActivate={handleTabActivated}
                onBeforeTabSwitch={handleBeforeTabSwitch}
                onAfterClose={handleAfterClose}
              />
              {!isDocumentDb && !isKeyValueDb && filterVisible && (
                <FilterPanel tabId={filterTabId} columns={filterColumns} />
              )}
                <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
                  {isKeyValueDb ? (
                    <>
                      <RedisCommandPanel />
                      <div className="flex-1 overflow-hidden">
                        <ResultPanel
                          sessionId={sessionId}
                          onRowSelect={(i) => useLayoutStore.getState().setSelectedRowIndex(i)}
                        />
                      </div>
                    </>
                  ) : isDocumentDb ? (
                    <>
                      <MongodbQueryPanel />
                      <div className="flex-1 overflow-hidden">
                        <ResultPanel
                          sessionId={sessionId}
                          onRowSelect={(i) => useLayoutStore.getState().setSelectedRowIndex(i)}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ height: `${editorHeightPercent}%` }} className="flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-hidden">
                          <SqlEditor />
                        </div>
                        <EditorStatusBar />
                      </div>
                      <div
                        className="group h-1.5 cursor-row-resize bg-border-subtle hover:bg-accent-blue flex items-center justify-center"
                        onMouseDown={handleEditorResize}
                      >
                        <div className="flex gap-1 opacity-40 group-hover:opacity-70">
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                          <span className="h-1 w-1 rounded-full bg-current" />
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden flex flex-col">
                        {explainResult && (
                          <div className="max-h-[40%] overflow-hidden">
                            <ExplainPanel
                              result={explainResult}
                              onClose={() => useQueryStore.setState({ explainResult: null })}
                            />
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <ResultPanel
                            sessionId={sessionId}
                            onRowSelect={(i) => useLayoutStore.getState().setSelectedRowIndex(i)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
            </>
          )}
        </main>

        {inspectorVisible && isConnected && (
          <>
            <div
              className="group w-1.5 cursor-col-resize bg-border-subtle hover:bg-accent-blue flex flex-col items-center justify-center"
              onMouseDown={handleInspectorResize}
            >
              <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-70">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </div>
            </div>
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

        {/* AI Chat slide-over overlay */}
        {aiChatVisible && isConnected && (
          <>
            <div
              className="absolute inset-0 z-20 bg-black/20"
              onClick={() => useLayoutStore.getState().toggleAiChat()}
            />
            <div
              className="absolute right-0 top-0 h-full w-[400px] transform shadow-panel slide-in-right"
              style={{ zIndex: 21 }}
            >
              <AiChatPanel
                onClose={() => useLayoutStore.getState().toggleAiChat()}
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

      <UnsavedChangesDialog
        open={unsavedDialog !== null}
        onSave={() => void handleUnsavedSave()}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />
      </EditorViewProvider>
    </div>
  );
}
