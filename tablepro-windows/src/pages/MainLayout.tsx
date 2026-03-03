import { useState, useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Sidebar } from "../components/layout/Sidebar";
import { Toolbar } from "../components/layout/Toolbar";
import { TabBar } from "../components/layout/TabBar";
import { StatusBar } from "../components/layout/StatusBar";
import { QueryEditorView } from "../components/editor/QueryEditorView";
import { StructureView } from "../components/structure/StructureView";
import { ExportDialog } from "../components/export/ExportDialog";
import { ImportDialog } from "../components/import/ImportDialog";
import { AIChatPanel } from "../components/ai/AIChatPanel";
import { ShortcutReferenceDialog } from "../components/shortcuts/ShortcutReferenceDialog";
import { useAppStore } from "../stores/app";
import { useTabStore } from "../stores/tabs";
import { useAIStore } from "../stores/ai";
import { useSettingsStore } from "../stores/settings";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import type { QueryResult } from "../types";

export function MainLayout() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const addTab = useTabStore((s) => s.addTab);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const [viewMode, setViewMode] = useState<"data" | "structure">("data");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<QueryResult | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [vimMode, setVimMode] = useState<"NORMAL" | "INSERT" | "VISUAL" | "REPLACE">("NORMAL");
  const aiPanelOpen = useAIStore((s) => s.isPanelOpen);
  const vimModeEnabled = useSettingsStore((s) => s.settings?.editor.vimModeEnabled ?? false);

  const handleNewTab = useCallback(() => {
    if (activeConnectionId) {
      addTab(activeConnectionId, null);
    }
  }, [activeConnectionId, addTab]);

  const handleTableSelect = useCallback(
    (tableName: string) => {
      setSelectedTable(tableName);
      if (activeConnectionId) {
        const tabId = addTab(activeConnectionId, null);
        const updateTabQuery = useTabStore.getState().updateTabQuery;
        const updateTabTitle = useTabStore.getState().updateTabTitle;
        updateTabQuery(tabId, `SELECT * FROM ${tableName} LIMIT 100;`);
        updateTabTitle(tabId, tableName);
      }
    },
    [activeConnectionId, addTab],
  );

  const handleRunQuery = useCallback(() => {
    // Handled by the editor component's Ctrl+Enter
  }, []);

  const handleQueryResult = useCallback((result: QueryResult) => {
    setLastResult(result);
  }, []);

  const handleApplyToEditor = useCallback(
    (sql: string) => {
      if (activeTabId) {
        const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
        const current = tab?.query ?? "";
        const newQuery = current ? `${current}\n${sql}` : sql;
        useTabStore.getState().updateTabQuery(activeTabId, newQuery);
      }
    },
    [activeTabId],
  );

  useKeyboardShortcuts({
    onRunQuery: handleRunQuery,
    onRefresh: handleRunQuery,
    onShowShortcuts: () => setShowShortcuts(true),
  });

  const showStructure = viewMode === "structure" && selectedTable;

  const activeTab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <Toolbar
        onRunQuery={handleRunQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExport={activeConnectionId ? () => setShowExport(true) : undefined}
        onImport={activeConnectionId ? () => setShowImport(true) : undefined}
      />
      <TabBar onNewTab={handleNewTab} />

      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={20} minSize={15} maxSize={40}>
          <Sidebar onTableSelect={handleTableSelect} />
        </Panel>

        <Separator className="w-px bg-zinc-200 hover:bg-blue-500 transition-colors dark:bg-zinc-700" />

        <Panel defaultSize={aiPanelOpen ? 60 : 80}>
          <div className="flex h-full flex-col">
            {showStructure ? (
              <StructureView tableName={selectedTable} />
            ) : activeTabId ? (
              <QueryEditorView
                tabId={activeTabId}
                onQueryResult={handleQueryResult}
                onVimModeChange={setVimMode}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-zinc-500 mb-2">
                    Select a table or open a new query tab
                  </p>
                  <button
                    onClick={handleNewTab}
                    className="rounded-lg border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:text-zinc-200"
                  >
                    + New Query
                  </button>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {aiPanelOpen && (
          <>
            <Separator className="w-px bg-zinc-200 hover:bg-blue-500 transition-colors dark:bg-zinc-700" />
            <Panel defaultSize={20} minSize={15} maxSize={40}>
              <AIChatPanel onApplyToEditor={handleApplyToEditor} />
            </Panel>
          </>
        )}
      </Group>

      <StatusBar
        rowCount={lastResult?.rows.length}
        executionTime={lastResult?.execution_time_ms}
        vimMode={vimMode}
        vimEnabled={vimModeEnabled}
      />

      <ShortcutReferenceDialog
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {showExport && activeConnectionId && (
        <ExportDialog
          connectionId={activeConnectionId}
          query={activeTab?.query ?? "SELECT 1"}
          tableName={selectedTable ?? undefined}
          onClose={() => setShowExport(false)}
        />
      )}

      {showImport && activeConnectionId && (
        <ImportDialog
          connectionId={activeConnectionId}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
