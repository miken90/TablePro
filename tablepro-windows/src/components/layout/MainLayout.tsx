import { useState, useCallback, useEffect } from "react";
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
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useQueryStore } from "../../stores/queryStore";
import { useTheme } from "../../hooks/useTheme";
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

export function MainLayout() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
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
  const [activeWhereClause, setActiveWhereClause] = useState("");
  const [filterColumns, setFilterColumns] = useState<ColumnInfo[]>([]);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const setQueryText = useQueryStore((s) => s.setQueryText);

  useTheme();

  // Keyboard shortcuts: Ctrl+K, Ctrl+,, Ctrl+Shift+F
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
        setActiveWhereClause("");
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
        setActiveWhereClause("");
      }
    },
    [selectedConnectionId]
  );

  const handleSwitchToQueryMode = useCallback(() => {
    setViewMode('query');
    setActiveTableContext(null);
  }, []);

  const handleFilterApply = useCallback((clause: string) => {
    setActiveWhereClause(clause);
  }, []);

  const handleFilterClear = useCallback(() => {
    setActiveWhereClause("");
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white dark:bg-zinc-900">
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
              <Sidebar onViewStructure={handleViewStructure} onOpenTable={handleOpenTable} />
            </div>
            <div
              className="w-1 cursor-col-resize bg-zinc-200 hover:bg-blue-400 dark:bg-zinc-700 dark:hover:bg-blue-500"
              onMouseDown={handleSidebarResize}
            />
          </>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
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
                  columns={filterColumns}
                  onApply={handleFilterApply}
                  onClear={handleFilterClear}
                />
              )}
              <div className="flex-1 overflow-hidden">
                <ResultPanel
                  tableName={activeTableContext.tableName}
                  schema={activeTableContext.schema}
                  sessionId={sessionId}
                  activeWhereClause={activeWhereClause}
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
                  columns={filterColumns}
                  onApply={handleFilterApply}
                  onClear={handleFilterClear}
                />
              )}
              <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
                <div style={{ height: `${editorHeightPercent}%` }} className="overflow-hidden">
                  <SqlEditor />
                </div>
                <div
                  className="h-1 cursor-row-resize bg-zinc-200 hover:bg-blue-400 dark:bg-zinc-700 dark:hover:bg-blue-500"
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
        </div>

        {inspectorVisible && isConnected && (
          <>
            <div
              className="w-1 cursor-col-resize bg-zinc-200 hover:bg-blue-400 dark:bg-zinc-700 dark:hover:bg-blue-500"
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
            <div className="w-px bg-zinc-200 dark:bg-zinc-700" />
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

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
