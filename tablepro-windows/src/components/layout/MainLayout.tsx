import { Toolbar } from "./Toolbar";
import { ConnectedLayout } from "./ConnectedLayout";
import { OverlayRegion } from "./OverlayRegion";
import { StatusBar } from "./StatusBar";
import { EditorViewProvider } from "../../contexts/editor-view-context";
import { useEditorStore } from "../../stores/editorStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useChangeStore } from "../../stores/changeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTheme } from "../../hooks/useTheme";
import { useMainLayoutShortcuts } from "../../hooks/useMainLayoutShortcuts";
import { useMainLayoutCommands } from "../../hooks/useMainLayoutCommands";
import { useTableCallbacks } from "../../hooks/useTableCallbacks";
import { useState, useCallback, useRef, useEffect } from "react";
import { ErrorBoundary } from "../shared/error-boundary";

export function MainLayout() {
  useTheme();
  useMainLayoutShortcuts();
  useMainLayoutCommands();

  // Load persisted tab state and settings from backend on mount
  useEffect(() => {
    void useEditorStore.getState().initFromBackend();
    void useSettingsStore.getState().loadSettings();
  }, []);

  const { handleQuickSwitcherSelect, handleHistorySelect } = useTableCallbacks();

  // --- Unsaved changes dialog for tab switching ---
  const [unsavedDialog, setUnsavedDialog] = useState<{ targetTabId: string } | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  const requestSaveRef = useRef<(() => void) | null>(null);
  const addRowRef = useRef<(() => void) | null>(null);

  const handleBeforeTabSwitch = useCallback((targetTabId: string): boolean => {
    const hasChanges = useChangeStore.getState().hasChanges;
    if (!hasChanges) return true;
    setUnsavedDialog({ targetTabId });
    return false;
  }, []);

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

  const handleTabActivated = useCallback(() => {
    const tabId = useEditorStore.getState().activeTabId;
    if (!tabId) return;
    const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.type === "query") {
      useLayoutStore.getState().switchToQueryMode();
    } else if (tab.type === "table" && tab.tableName) {
      useLayoutStore.getState().openTable(tab.tableName, tab.tableSchema);
    }
  }, []);

  const handleUnsavedSave = useCallback(async () => {
    if (!unsavedDialog) return;
    const targetTabId = unsavedDialog.targetTabId;
    if (pendingSaveRef.current) {
      try {
        await pendingSaveRef.current();
        setUnsavedDialog(null);
        performTabSwitch(targetTabId);
      } catch {
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

        <ConnectedLayout
          onBeforeTabSwitch={handleBeforeTabSwitch}
          onTabActivated={handleTabActivated}
          onAfterClose={handleAfterClose}
          pendingSaveRef={pendingSaveRef}
          requestSaveRef={requestSaveRef}
          addRowRef={addRowRef}
        />

        <ErrorBoundary name="statusbar">
          <StatusBar />
        </ErrorBoundary>

        <OverlayRegion
          unsavedDialog={unsavedDialog}
          onUnsavedSave={() => void handleUnsavedSave()}
          onUnsavedDiscard={handleUnsavedDiscard}
          onUnsavedCancel={handleUnsavedCancel}
          onQuickSwitcherSelect={handleQuickSwitcherSelect}
          onHistorySelect={handleHistorySelect}
        />
      </EditorViewProvider>
    </div>
  );
}
