import { Channel, invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATE_LAST_CHECK_KEY = "tablepro:last-update-check";

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

interface UpdaterMetadata {
  rid: number;
  version: string;
  date?: string;
  body?: string;
}

export interface AvailableUpdate {
  version: string;
  notes?: string | null;
  date?: string | null;
}

interface AutoUpdaterState {
  availableUpdate: AvailableUpdate | null;
  isChecking: boolean;
  isInstalling: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  dismissedVersion: string | null;
}

const initialState: AutoUpdaterState = {
  availableUpdate: null,
  isChecking: false,
  isInstalling: false,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
  dismissedVersion: null,
};

function shouldSkipAutoCheck(): boolean {
  const lastCheckRaw = localStorage.getItem(UPDATE_LAST_CHECK_KEY);
  if (!lastCheckRaw) return false;
  const lastCheck = Number(lastCheckRaw);
  if (!Number.isFinite(lastCheck)) return false;
  return Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS;
}

function saveCheckTimestamp() {
  localStorage.setItem(UPDATE_LAST_CHECK_KEY, String(Date.now()));
}

function formatUpdaterError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function checkUpdateMetadata() {
  return invoke<UpdaterMetadata | null>("plugin:updater|check");
}

async function closeResource(rid: number) {
  await invoke("plugin:resources|close", { rid });
}

export function useAutoUpdater() {
  const [state, setState] = useState(initialState);

  const checkForUpdate = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isChecking: true,
      error: null,
      downloadedBytes: 0,
      totalBytes: null,
      availableUpdate: null,
    }));

    try {
      const metadata = await checkUpdateMetadata();
      saveCheckTimestamp();

      if (!metadata) {
        setState((prev) => ({ ...prev, isChecking: false, availableUpdate: null }));
        return;
      }

      await closeResource(metadata.rid);
      setState((prev) => ({
        ...prev,
        isChecking: false,
        availableUpdate: {
          version: metadata.version,
          notes: metadata.body ?? null,
          date: metadata.date ?? null,
        },
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isChecking: false,
        error: formatUpdaterError(error),
      }));
    }
  }, []);

  const installUpdate = useCallback(async () => {
    let metadata: UpdaterMetadata | null = null;

    try {
      metadata = await checkUpdateMetadata();
      if (!metadata) {
        setState((prev) => ({ ...prev, error: "No update available." }));
        return;
      }

      setState((prev) => ({
        ...prev,
        isInstalling: true,
        error: null,
        downloadedBytes: 0,
        totalBytes: null,
      }));

      const onEvent = new Channel<DownloadEvent>();
      onEvent.onmessage = (event) => {
        setState((prev) => {
          if (event.event === "Started") {
            return {
              ...prev,
              totalBytes: event.data.contentLength ?? null,
              downloadedBytes: 0,
            };
          }

          if (event.event === "Progress") {
            return {
              ...prev,
              downloadedBytes: prev.downloadedBytes + event.data.chunkLength,
            };
          }

          return prev;
        });
      };

      await invoke("plugin:updater|download_and_install", {
        rid: metadata.rid,
        onEvent,
      });

      setState((prev) => ({
        ...prev,
        isInstalling: false,
        availableUpdate: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isInstalling: false,
        error: formatUpdaterError(error),
      }));
    } finally {
      if (metadata) {
        try {
          await closeResource(metadata.rid);
        } catch {
          // plugin may already close updater resource
        }
      }
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      dismissedVersion: prev.availableUpdate?.version ?? prev.dismissedVersion,
      availableUpdate: null,
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    }));
  }, []);

  useEffect(() => {
    // Skip update checks in dev mode — the updater plugin is not registered.
    if (import.meta.env.DEV) return;
    if (shouldSkipAutoCheck()) return;
    void checkForUpdate();
  }, [checkForUpdate]);

  const shouldShowNotification = useMemo(() => {
    if (!state.availableUpdate) return false;
    return state.dismissedVersion !== state.availableUpdate.version;
  }, [state.availableUpdate, state.dismissedVersion]);

  return {
    availableUpdate: state.availableUpdate,
    isChecking: state.isChecking,
    isInstalling: state.isInstalling,
    downloadedBytes: state.downloadedBytes,
    totalBytes: state.totalBytes,
    error: state.error,
    shouldShowNotification,
    installUpdate,
    dismissUpdate,
    checkForUpdate,
  };
}
