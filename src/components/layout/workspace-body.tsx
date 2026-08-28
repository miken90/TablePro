import { lazy, Suspense, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Boxes } from "lucide-react";
import { SqlEditor } from "../editor/sql-editor";
import { EditorStatusBar } from "../editor/editor-status-bar";
import { ResultPanel } from "../grid/ResultPanel";
import { ContextualBar } from "../grid/contextual-bar";
import { TableStructureView } from "../structure/table-structure-view";
import { FilterPanel } from "../filter/filter-panel";
import { PanelLoader } from "../shared/PanelLoader";
import { EmptyState } from "../shared/EmptyState";
import { useEditorStore } from "../../stores/editorStore";
import { useLayoutStore, EDITOR_MIN_PERCENT } from "../../stores/layoutStore";
import { activateQueryTab } from "../../stores/active-tab-sync";
import { useResizable } from "../../hooks/useResizable";
import { useFilterContext } from "../../hooks/useFilterContext";
import { resolveWorkspaceView, type WorkspaceEngine } from "./workspace-view-resolver";

const MongodbQueryPanel = lazy(() => import("../mongodb/mongodb-query-panel").then(m => ({ default: m.MongodbQueryPanel })));
const RedisCommandPanel = lazy(() => import("../redis/redis-command-panel").then(m => ({ default: m.RedisCommandPanel })));

export interface WorkspaceBodyProps {
  engine: WorkspaceEngine;
  pendingSaveRef: MutableRefObject<(() => Promise<void>) | null>;
  requestSaveRef: MutableRefObject<(() => void) | null>;
  addRowRef: MutableRefObject<(() => void) | null>;
  deleteSelectedRef: MutableRefObject<(() => void) | null>;
  clearSelectionRef: MutableRefObject<(() => void) | null>;
}

/**
 * The body under the tab bar. Renders exactly one view for the active tab,
 * chosen by `resolveWorkspaceView` — only the active tab's body is mounted,
 * which is what keeps a restored structure tab from fetching until it is
 * clicked (Q5).
 */
export function WorkspaceBody({
  engine,
  pendingSaveRef,
  requestSaveRef,
  addRowRef,
  deleteSelectedRef,
  clearSelectionRef,
}: WorkspaceBodyProps) {
  const { t } = useTranslation();
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const view = resolveWorkspaceView(activeTab, engine);

  const selectedRowCount = useLayoutStore((s) => s.selectedRowCount);
  const editorHeightPercent = useLayoutStore((s) => s.editorHeightPercent);
  const filterVisible = useLayoutStore((s) => s.filterVisible);
  const filterColumns = useLayoutStore((s) => s.filterColumns);
  const { filterTabId, activeWhereClause } = useFilterContext(activeTab);

  const { onMouseDown: handleEditorResize } = useResizable({
    direction: "vertical",
    min: EDITOR_MIN_PERCENT,
    max: 80,
    containerSelector: ".editor-results-container",
    onResize: useLayoutStore.getState().setEditorHeightPercent,
  });

  const onRowSelect = (i: number | null) => useLayoutStore.getState().setSelectedRowIndex(i);

  switch (view.kind) {
    case "welcome":
      return null;

    case "unsupported":
      return (
        <EmptyState
          icon={<Boxes size={24} aria-hidden="true" />}
          message={t("workspace.unsupportedTab")}
          description={view.reason}
        />
      );

    case "connecting":
      return <PanelLoader />;

    case "structure":
      return (
        <TableStructureView
          sessionId={engine.sessionId!}
          connectionId={activeTab?.connectionId}
          tableName={view.tableName!}
          schema={view.schema}
        />
      );

    case "table":
      return (
        <>
          <ContextualBar
            tabId={filterTabId}
            tableName={view.tableName!}
            columns={filterColumns}
            onSave={engine.isDocumentDb ? () => {} : () => requestSaveRef.current?.()}
            onAddRow={engine.isDocumentDb ? undefined : () => addRowRef.current?.()}
            selectedRowCount={selectedRowCount}
            onDeleteSelected={engine.isDocumentDb ? undefined : () => deleteSelectedRef.current?.()}
            onDeselectAll={() => clearSelectionRef.current?.()}
          />
          <div className="flex-1 overflow-hidden">
            <ResultPanel
              tabId={filterTabId}
              tableName={view.tableName}
              schema={view.schema}
              sessionId={engine.sessionId}
              activeWhereClause={activeWhereClause}
              quickSearchColumns={filterColumns}
              onRowSelect={onRowSelect}
              onOpenQueryEditor={() => activateQueryTab()}
              onSaveRef={pendingSaveRef}
              onRequestSaveRef={requestSaveRef}
              onAddRowRef={addRowRef}
              onDeleteSelectedRef={deleteSelectedRef}
              onClearSelectionRef={clearSelectionRef}
            />
          </div>
        </>
      );

    case "redisCommand":
      return (
        <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
          <Suspense fallback={<PanelLoader />}>
            <RedisCommandPanel />
          </Suspense>
          <div className="flex-1 overflow-hidden">
            <ResultPanel sessionId={engine.sessionId} onRowSelect={onRowSelect} />
          </div>
        </div>
      );

    case "mongoQuery":
      return (
        <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
          <Suspense fallback={<PanelLoader />}>
            <MongodbQueryPanel />
          </Suspense>
          <div className="flex-1 overflow-hidden">
            <ResultPanel sessionId={engine.sessionId} onRowSelect={onRowSelect} />
          </div>
        </div>
      );

    case "query":
      return (
        <>
          {filterVisible && <FilterPanel tabId={filterTabId} columns={filterColumns} />}
          <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
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
            <div className="flex-1 overflow-hidden">
              <ResultPanel sessionId={engine.sessionId} onRowSelect={onRowSelect} />
            </div>
          </div>
        </>
      );
  }
}
