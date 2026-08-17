import type React from "react";
import { lazy, Suspense, useRef, type MutableRefObject } from "react";
import { Sidebar } from "./Sidebar";
import { EditorTabBar } from "../editor/EditorTabBar";
import { SqlEditor } from "../editor/sql-editor";
import { EditorStatusBar } from "../editor/editor-status-bar";
import { ResultPanel } from "../grid/ResultPanel";
import { ContextualBar } from "../grid/contextual-bar";
import { WelcomeView } from "../connection/WelcomeView";
import { TableStructureView } from "../structure/table-structure-view";
import { FilterPanel } from "../filter/filter-panel";
import { InspectorPanel } from "../inspector/inspector-panel";
import { HistoryPanel } from "../history/HistoryPanel";
import { PanelLoader } from "../shared/PanelLoader";
import { ErrorBoundary } from "../shared/error-boundary";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../../stores/queryStore";
import { useInspectorStore } from "../../stores/inspectorStore";
import { refreshActiveSchema, useSchemaStore } from "../../stores/schemaStore";
import {
  useLayoutStore,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  EDITOR_MIN_PERCENT,
  INSPECTOR_MIN,
  INSPECTOR_MAX,
} from "../../stores/layoutStore";
import { useResizable } from "../../hooks/useResizable";
import { useFilterContext } from "../../hooks/useFilterContext";
import { useTableCallbacks } from "../../hooks/useTableCallbacks";

const AiChatPanel = lazy(() => import("../ai/ai-chat-panel").then(m => ({ default: m.AiChatPanel })));
const ImportDialog = lazy(() => import("../import/import-dialog").then(m => ({ default: m.ImportDialog })));
const MongodbQueryPanel = lazy(() => import("../mongodb/mongodb-query-panel").then(m => ({ default: m.MongodbQueryPanel })));
const RedisCommandPanel = lazy(() => import("../redis/redis-command-panel").then(m => ({ default: m.RedisCommandPanel })));
const ExplainPanel = lazy(() => import("../editor/explain-panel").then(m => ({ default: m.ExplainPanel })));

interface ConnectedLayoutProps {
  onBeforeTabSwitch: (targetTabId: string) => boolean;
  onTabActivated: () => void;
  onAfterClose: (newActiveTabId: string | null) => void;
  pendingSaveRef: MutableRefObject<(() => Promise<void>) | null>;
  requestSaveRef: MutableRefObject<(() => void) | null>;
  addRowRef: MutableRefObject<(() => void) | null>;
}

export function ConnectedLayout({
  onBeforeTabSwitch,
  onTabActivated,
  onAfterClose,
  pendingSaveRef,
  requestSaveRef,
  addRowRef,
}: ConnectedLayoutProps) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const deleteSelectedRef = useRef<(() => void) | null>(null);
  const clearSelectionRef = useRef<(() => void) | null>(null);
  const selectedRowCount = useLayoutStore((s) => s.selectedRowCount);
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
  const structureTarget = useLayoutStore((s) => s.structureTarget);
  const viewMode = useLayoutStore((s) => s.viewMode);
  const activeTableContext = useLayoutStore((s) => s.activeTableContext);
  const filterVisible = useLayoutStore((s) => s.filterVisible);
  const filterColumns = useLayoutStore((s) => s.filterColumns);
  const inspectorVisible = useLayoutStore((s) => s.inspectorVisible);
  const inspectorWidth = useLayoutStore((s) => s.inspectorWidth);
  const selectedRowIndex = useLayoutStore((s) => s.selectedRowIndex);
  const historyVisible = useLayoutStore((s) => s.historyVisible);
  const aiChatVisible = useLayoutStore((s) => s.aiChatVisible);

  const { filterTabId, activeWhereClause } = useFilterContext(viewMode, activeTableContext, activeTabId);
  const { handleOpenTable, handleOpenPreviewTable, handleHistorySelect } = useTableCallbacks();

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

  const inspectorColumns = inspectorStoreRow ? inspectorStoreColumns : (queryResult?.columns ?? []);
  const selectedRow = inspectorStoreRow
    ?? (queryResult && selectedRowIndex !== null ? (queryResult.rows[selectedRowIndex] ?? null) : null);

  const sessionId = resolveActiveQuerySessionId();
  const importOpen = useLayoutStore((s) => s.importOpen);
  const isConnected = !!selectedConnectionId;

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <>
          <div style={{ width: sidebarWidth }} className="flex-shrink-0 overflow-hidden">
            <ErrorBoundary name="sidebar">
              <Sidebar
                onViewStructure={(t, s) => useLayoutStore.getState().openStructure(t, s)}
                onOpenTable={handleOpenTable}
                onOpenPreviewTable={handleOpenPreviewTable}
              />
            </ErrorBoundary>
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

      {/* Main content */}
      <main id="main-content" className="flex flex-1 flex-col overflow-hidden">
        <ErrorBoundary name="editor">
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
                onTabActivate={onTabActivated}
                onBeforeTabSwitch={onBeforeTabSwitch}
                onAfterClose={onAfterClose}
              />
              <ContextualBar
                tabId={filterTabId}
                tableName={activeTableContext.tableName}
                columns={filterColumns}
                onSave={isDocumentDb ? () => {} : () => requestSaveRef.current?.()}
                onAddRow={isDocumentDb ? undefined : () => addRowRef.current?.()}
                selectedRowCount={selectedRowCount}
                onDeleteSelected={isDocumentDb ? undefined : () => deleteSelectedRef.current?.()}
                onDeselectAll={() => clearSelectionRef.current?.()}
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
                  onDeleteSelectedRef={deleteSelectedRef}
                  onClearSelectionRef={clearSelectionRef}
                  hideChangeToolbar
                />
              </div>
            </>
          ) : (
            <>
              <EditorTabBar
                onTabActivate={onTabActivated}
                onBeforeTabSwitch={onBeforeTabSwitch}
                onAfterClose={onAfterClose}
              />
              {!isDocumentDb && !isKeyValueDb && filterVisible && (
                <FilterPanel tabId={filterTabId} columns={filterColumns} />
              )}
              <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
                {isKeyValueDb ? (
                  <>
                    <Suspense fallback={<PanelLoader />}>
                      <RedisCommandPanel />
                    </Suspense>
                    <div className="flex-1 overflow-hidden">
                      <ResultPanel
                        sessionId={sessionId}
                        onRowSelect={(i) => useLayoutStore.getState().setSelectedRowIndex(i)}
                      />
                    </div>
                  </>
                ) : isDocumentDb ? (
                  <>
                    <Suspense fallback={<PanelLoader />}>
                      <MongodbQueryPanel />
                    </Suspense>
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
                          <Suspense fallback={<PanelLoader />}>
                            <ExplainPanel
                              result={explainResult}
                              onClose={() => useQueryStore.setState({ explainResult: null })}
                            />
                          </Suspense>
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
        </ErrorBoundary>
      </main>

      {/* Inspector */}
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
            <ErrorBoundary name="inspector">
              <InspectorPanel
                columns={inspectorColumns}
                row={selectedRow}
                onClose={() => useLayoutStore.getState().toggleInspector()}
              />
            </ErrorBoundary>
          </div>
        </>
      )}

      {/* History slide-over */}
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

      {/* AI Chat slide-over */}
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
            <Suspense fallback={<PanelLoader className="w-[400px] h-full" />}>
              <AiChatPanel
                onClose={() => useLayoutStore.getState().toggleAiChat()}
              />
            </Suspense>
          </div>
        </>
      )}

      {/* SQL file import — opened by the `data.importSql` command (toolbar
          button, command palette, or its keyboard shortcut). Lives here
          because importing needs an active session. */}
      {importOpen && isConnected && sessionId && (
        <Suspense fallback={<PanelLoader />}>
          <ImportDialog
            open
            sessionId={sessionId}
            onClose={() => useLayoutStore.getState().setImportOpen(false)}
            onComplete={() => {
              // Imported DDL/DML can change the schema the sidebar shows.
              // This used to dispatch an event nothing listened for, so the
              // tree kept showing the pre-import schema.
              refreshActiveSchema();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
