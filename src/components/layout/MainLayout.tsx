import { Toolbar } from "./Toolbar";
import { ConnectedLayout } from "./ConnectedLayout";
import { OverlayRegion } from "./OverlayRegion";
import { StatusBar } from "./StatusBar";
import { EditorViewProvider } from "../../contexts/editor-view-context";
import { useEditorStore } from "../../stores/editorStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { activateQueryTab, installActiveTabSync, syncActiveTabContext } from "../../stores/active-tab-sync";
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
    // Every change of the active tab syncs the side state, whoever wrote it.
    const uninstall = installActiveTabSync();
    // A restored active tab has no click behind it, so nothing else would
    // scope the change store or apply the inspector rule for it.
    void useEditorStore.getState().initFromBackend()
      .then(() => syncActiveTabContext(useEditorStore.getState().activeTabId))
      .catch((err) => console.error("Failed to restore tabs:", err));
    void useSettingsStore.getState().loadSettings();
    return uninstall;
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
    // Looking at a table's structure is read-only; the staged edits stay in
    // their table's snapshot, so there is nothing to save or discard.
    const target = useEditorStore.getState().tabs.find((t) => t.id === targetTabId);
    if (target?.type === "structure") return true;
    setUnsavedDialog({ targetTabId });
    return false;
  }, []);

  const performTabSwitch = useCallback((tabId: string) => {
    if (!useEditorStore.getState().tabs.some((t) => t.id === tabId)) return;
    useEditorStore.getState().setActiveTab(tabId);
    syncActiveTabContext(tabId);
  }, []);

  const handleTabActivated = useCallback(() => {
    syncActiveTabContext(useEditorStore.getState().activeTabId);
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
    syncActiveTabContext(newActiveTabId);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-base">
      <EditorViewProvider>
        <Toolbar
          onToggleSidebar={() => useLayoutStore.getState().toggleSidebar()}
          onOpenSettings={() => useLayoutStore.getState().setSettingsOpen(true)}
          onToggleHistory={() => useLayoutStore.getState().toggleHistory()}
          onToggleAiChat={() => useLayoutStore.getState().toggleAiChat()}
          onRunQuery={() => activateQueryTab()}
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
