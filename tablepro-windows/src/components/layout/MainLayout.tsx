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
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStore } from "../../stores/editorStore";
import { useTheme } from "../../hooks/useTheme";

const SIDEBAR_DEFAULT = 240;
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const EDITOR_MIN_PERCENT = 20;

interface StructureTarget {
  tableName: string;
  schema?: string | null;
}

export function MainLayout() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorHeightPercent, setEditorHeightPercent] = useState(50);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [structureTarget, setStructureTarget] = useState<StructureTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Apply theme from settings
  useTheme();

  // Ctrl+K global handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      }
      // Ctrl+, — open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      // Open a new editor tab pre-filled with SELECT *
      const qualifiedName = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
      const sql = `SELECT * FROM ${qualifiedName};`;
      if (selectedConnectionId) {
        const tabId = addTab(`${tableName}`);
        updateTabContent(tabId, sql);
      }
    },
    [selectedConnectionId, addTab, updateTabContent]
  );

  const showEditor = !!selectedConnectionId && !!activeTabId;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white dark:bg-zinc-900">
      {/* Toolbar */}
      <Toolbar
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0 overflow-hidden">
              <Sidebar onViewStructure={handleViewStructure} />
            </div>
            {/* Sidebar resize handle */}
            <div
              className="w-1 cursor-col-resize bg-zinc-200 hover:bg-blue-400 dark:bg-zinc-700 dark:hover:bg-blue-500"
              onMouseDown={handleSidebarResize}
            />
          </>
        )}

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Structure view overlay */}
          {structureTarget && selectedConnectionId && getSessionId(selectedConnectionId) ? (
            <TableStructureView
              sessionId={getSessionId(selectedConnectionId)!}
              tableName={structureTarget.tableName}
              schema={structureTarget.schema ?? undefined}
              onClose={() => setStructureTarget(null)}
            />
          ) : !showEditor ? (
            <WelcomeView />
          ) : (
            <>
              <EditorTabBar />
              <div className="editor-results-container flex flex-1 flex-col overflow-hidden">
                {/* Editor */}
                <div style={{ height: `${editorHeightPercent}%` }} className="overflow-hidden">
                  <SqlEditor />
                </div>

                {/* Splitter */}
                <div
                  className="h-1 cursor-row-resize bg-zinc-200 hover:bg-blue-400 dark:bg-zinc-700 dark:hover:bg-blue-500"
                  onMouseDown={handleEditorResize}
                />

                {/* Results */}
                <div className="flex-1 overflow-hidden">
                  <ResultPanel />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Switcher (portal-like, always mounted) */}
      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        onSelectTable={handleQuickSwitcherSelect}
      />

      {/* Settings modal */}
      {settingsOpen && <SettingsView onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
