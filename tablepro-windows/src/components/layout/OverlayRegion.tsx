import { lazy, Suspense, useState, useCallback, useEffect } from "react";
import { QuickSwitcher } from "./quick-switcher";
import { UpdateNotification } from "../shared/update-notification";
import { CommandPalette } from "../shared/command-palette";
import { QueryAnnouncer } from "../shared/query-announcer";
import { UnsavedChangesDialog } from "../shared/unsaved-changes-dialog";
import { PanelLoader } from "../shared/PanelLoader";
import { useLayoutStore } from "../../stores/layoutStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAutoUpdater } from "../../hooks/useAutoUpdater";
import { ErrorBoundary } from "../shared/error-boundary";

const SettingsView = lazy(() => import("../settings/settings-view").then(m => ({ default: m.SettingsView })));
const ShortcutsHelp = lazy(() => import("../shared/ShortcutsHelp").then(m => ({ default: m.ShortcutsHelp })));
const OnboardingDialog = lazy(() => import("../onboarding/onboarding-dialog").then(m => ({ default: m.OnboardingDialog })));

interface OverlayRegionProps {
  unsavedDialog: { targetTabId: string } | null;
  onUnsavedSave: () => void;
  onUnsavedDiscard: () => void;
  onUnsavedCancel: () => void;
  onQuickSwitcherSelect: (tableName: string, schema?: string | null) => void;
  onHistorySelect: (sql: string) => void;
}

export function OverlayRegion({
  unsavedDialog,
  onUnsavedSave,
  onUnsavedDiscard,
  onUnsavedCancel,
  onQuickSwitcherSelect,
}: OverlayRegionProps) {
  const quickSwitcherOpen = useLayoutStore((s) => s.quickSwitcherOpen);
  const settingsOpen = useLayoutStore((s) => s.settingsOpen);
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

  // Onboarding
  const hasCompletedOnboarding = useSettingsStore((s) => s.settings.hasCompletedOnboarding);
  const isSettingsLoaded = useSettingsStore((s) => s.isLoaded);
  const [showOnboarding, setShowOnboarding] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- show onboarding after settings load */
  useEffect(() => {
    if (isSettingsLoaded && !hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, [isSettingsLoaded, hasCompletedOnboarding]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    void useSettingsStore.getState().saveSettings({ hasCompletedOnboarding: true });
  }, []);

  return (
    <ErrorBoundary name="overlays">
      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => useLayoutStore.getState().setQuickSwitcherOpen(false)}
        onSelectTable={onQuickSwitcherSelect}
      />

      {settingsOpen && (
        <Suspense fallback={<PanelLoader />}>
          <SettingsView onClose={() => useLayoutStore.getState().setSettingsOpen(false)} />
        </Suspense>
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

      <Suspense fallback={null}>
        <ShortcutsHelp
          open={helpOpen}
          onClose={() => useLayoutStore.getState().setHelpOpen(false)}
        />
      </Suspense>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={(open) => useLayoutStore.getState().setCommandPaletteOpen(open)}
      />

      <QueryAnnouncer />

      <UnsavedChangesDialog
        open={unsavedDialog !== null}
        onSave={onUnsavedSave}
        onDiscard={onUnsavedDiscard}
        onCancel={onUnsavedCancel}
      />

      {showOnboarding && (
        <Suspense fallback={<PanelLoader />}>
          <OnboardingDialog onComplete={handleOnboardingComplete} />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}
