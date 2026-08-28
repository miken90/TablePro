import { lazy, Suspense, useRef, type MutableRefObject } from "react";
import { Sidebar } from "./Sidebar";
import { EditorTabBar } from "../editor/EditorTabBar";
import { WelcomeView } from "../connection/WelcomeView";
import { InspectorPanel } from "../inspector/inspector-panel";
import { HistoryPanel } from "../history/HistoryPanel";
import { PanelLoader } from "../shared/PanelLoader";
import { ErrorBoundary } from "../shared/error-boundary";
import { WorkspaceBody } from "./workspace-body";
import { useConnectionStore } from "../../stores/connectionStore";
import { resolveActiveQuerySessionId, useQueryStore } from "../../stores/queryStore";
import { useInspectorStore } from "../../stores/inspectorStore";
import { refreshActiveSchema, useSchemaStore } from "../../stores/schemaStore";
import { openStructureTab } from "../../stores/active-tab-sync";
import {
  useLayoutStore,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  INSPECTOR_MIN,
  INSPECTOR_MAX,
} from "../../stores/layoutStore";
import { useResizable } from "../../hooks/useResizable";
import { useTableCallbacks } from "../../hooks/useTableCallbacks";

const AiChatPanel = lazy(() => import("../ai/ai-chat-panel").then(m => ({ default: m.AiChatPanel })));
const ImportDialog = lazy(() => import("../import/import-dialog").then(m => ({ default: m.ImportDialog })));

interface ConnectedLayoutProps {
  onBeforeTabSwitch: (targetTabId: string) => boolean;
  onTabActivated: () => void;
  onAfterClose: (newActiveTabId: string | null) => void;
  pendingSaveRef: MutableRefObject<(() => Promise<void>) | null>;
  requestSaveRef: MutableRefObject<(() => void) | null>;
  addRowRef: MutableRefObject<(() => void) | null>;
}

/** Resizer grip shared by the sidebar and inspector splitters. */
function SplitterGrip() {
  return (
    <div className="flex flex-col gap-1 opacity-40 group-hover:opacity-70">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </div>
  );
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
  const connections = useConnectionStore((s) => s.connections);
  const capabilities = useSchemaStore((s) => s.capabilities);
  const isDocumentDb = capabilities.supportsCollections && !capabilities.supportsSqlEditor;
  const activeConnection = selectedConnectionId ? connections.get(selectedConnectionId) : undefined;
  const isKeyValueDb = activeConnection?.config?.dbType === "redis";

  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const inspectorVisible = useLayoutStore((s) => s.inspectorVisible);
  const inspectorWidth = useLayoutStore((s) => s.inspectorWidth);
  const selectedRowIndex = useLayoutStore((s) => s.selectedRowIndex);
  const historyVisible = useLayoutStore((s) => s.historyVisible);
  const aiChatVisible = useLayoutStore((s) => s.aiChatVisible);

  const { handleOpenTable, handleOpenPreviewTable, handleHistorySelect } = useTableCallbacks();

  const { onMouseDown: handleSidebarResize } = useResizable({
    direction: "horizontal",
    min: SIDEBAR_MIN,
    max: SIDEBAR_MAX,
    currentValue: sidebarWidth,
    onResize: useLayoutStore.getState().setSidebarWidth,
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
                onViewStructure={(t, s) => openStructureTab(t, s)}
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
            <SplitterGrip />
          </div>
        </>
      )}

      {/* Main content: the tab bar is always present while connected; the
          body is whatever the active tab kind resolves to (M1). */}
      <main id="main-content" className="flex flex-1 flex-col overflow-hidden">
        <ErrorBoundary name="editor">
          {!isConnected ? (
            <WelcomeView />
          ) : (
            <>
              <EditorTabBar
                onTabActivate={onTabActivated}
                onBeforeTabSwitch={onBeforeTabSwitch}
                onAfterClose={onAfterClose}
              />
              <WorkspaceBody
                engine={{ isConnected, sessionId, isDocumentDb, isKeyValueDb }}
                pendingSaveRef={pendingSaveRef}
                requestSaveRef={requestSaveRef}
                addRowRef={addRowRef}
                deleteSelectedRef={deleteSelectedRef}
                clearSelectionRef={clearSelectionRef}
              />
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
            <SplitterGrip />
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
