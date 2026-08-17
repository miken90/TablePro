import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useConnectionStore } from "./connectionStore";
import { cancelStreamsForTabs } from "./tab-stream-registry";
import * as commands from "../ipc/commands";
import {
  loadTabState,
  saveTabState,
  markLocalStorageMigrated,
  type TabStateFile,
  type PersistedTab,
} from "./tab-state-persistence";

export type TabType = 'query' | 'table' | 'structure' | 'mongoQuery' | 'redisCommand';

export interface EditorTab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  isPreview: boolean;
  /** Default: false — optional to support migration from older persisted state */
  isPinned?: boolean;
  connectionId?: string;
  /** Default: 'query' — optional to support migration from older persisted state */
  type?: TabType;
  /** For type === 'table' — the table being browsed */
  tableName?: string;
  /** For type === 'table' — the schema of the table */
  tableSchema?: string;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  /** True once backend state has been loaded (prevents saving empty state on startup) */
  _hydrated: boolean;

  // Actions
  initFromBackend: () => Promise<void>;
  addTab: (title?: string) => string;
  addPreviewTab: (title: string) => string;
  addTableTab: (tableName: string, schema?: string | null) => string;
  addMongoQueryTab: (title?: string) => string;
  addRedisCommandTab: (title?: string) => string;
  promoteTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  closeTabsToRight: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  renameTab: (id: string, title: string) => void;
  pinTab: (id: string) => void;
  unpinTab: (id: string) => void;
  setTabType: (id: string, type: TabType) => void;
  setTabConnectionId: (id: string, connectionId: string) => void;
}

let tabCounter = 1;

function generateTabId(): string {
  return `tab-${Date.now()}-${tabCounter++}`;
}

/** Abort the queries owned by tabs that are being closed. Without this the
 *  backend keeps running the statement and its chunks keep landing in the
 *  shared result store, rendering under whichever tab is now active. The
 *  backend cancel is included deliberately: nobody can ever see the result of
 *  a closed tab's query, so letting it run only burns server resources. */
function releaseClosedTabStreams(before: EditorTab[], after: EditorTab[]): void {
  const kept = new Set(after.map((t) => t.id));
  const closed = before.filter((t) => !kept.has(t.id)).map((t) => t.id);
  if (closed.length > 0) cancelStreamsForTabs(closed);
}

function syncSelectedConnectionByTabId(tabs: EditorTab[], tabId: string | null): void {
  if (!tabId) return;
  const connectionId = tabs.find((tab) => tab.id === tabId)?.connectionId;
  if (connectionId) {
    useConnectionStore.getState().selectConnection(connectionId);
  }
}

/** Convert backend PersistedTab to frontend EditorTab. */
function fromPersisted(p: PersistedTab): EditorTab {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    isDirty: false,
    isPreview: false,
    isPinned: p.isPinned,
    connectionId: p.connectionId ?? undefined,
    type: (p.tabType as TabType) || 'query',
    tableName: p.tableName ?? undefined,
    tableSchema: p.tableSchema ?? undefined,
  };
}

/** Convert frontend EditorTab to backend PersistedTab for saving. */
function toPersisted(t: EditorTab): PersistedTab {
  return {
    id: t.id,
    title: t.title,
    content: t.content.slice(0, 100_000),
    isPinned: t.isPinned ?? false,
    connectionId: t.connectionId ?? null,
    tabType: t.type ?? 'query',
    tableName: t.tableName ?? null,
    tableSchema: t.tableSchema ?? null,
  };
}

/** Filter tabs: drop orphaned table tabs and tabs with missing connections. */
function filterValidTabs(
  tabs: EditorTab[],
  savedConnectionIds: Set<string>,
): EditorTab[] {
  return tabs.filter((t) => {
    // Remove table tabs missing tableName (orphaned)
    if ((t.type ?? 'query') === 'table' && !t.tableName) return false;
    // Remove tabs whose saved connection no longer exists
    if (t.connectionId && !savedConnectionIds.has(t.connectionId)) return false;
    return true;
  });
}

/** Try to import tabs from localStorage (one-time migration). */
async function migrateFromLocalStorage(): Promise<EditorTab[] | null> {
  const raw = localStorage.getItem("tablepro-editor-tabs");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        tabs?: EditorTab[];
        activeTabId?: string | null;
      };
    };
    const tabs = parsed?.state?.tabs;
    if (!Array.isArray(tabs) || tabs.length === 0) return null;

    // Normalize migrated tabs
    return tabs.map((t) => ({
      ...t,
      isDirty: false,
      isPreview: false,
      isPinned: t.isPinned ?? false,
      type: t.type ?? 'query',
    }));
  } catch {
    return null;
  }
}

/** Parse activeTabId from localStorage for migration. */
function migrateActiveTabId(): string | null {
  const raw = localStorage.getItem("tablepro-editor-tabs");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { activeTabId?: string | null } };
    return parsed?.state?.activeTabId ?? null;
  } catch {
    return null;
  }
}

// --- Debounced save ---
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 800;

function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const state = useEditorStore.getState();
    if (!state._hydrated) return;
    const file: TabStateFile = {
      version: 1,
      migratedFromLocalStorage: true,
      tabs: state.tabs.map(toPersisted),
      activeTabId: state.activeTabId,
    };
    void saveTabState(file).catch((err) => {
      console.error("Failed to save tab state:", err);
    });
  }, SAVE_DEBOUNCE_MS);
}

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      _hydrated: false,

      initFromBackend: async () => {
        if (get()._hydrated) return;

        let backendState: TabStateFile;
        try {
          backendState = await loadTabState();
        } catch (err) {
          console.error("Failed to load tab state from backend:", err);
          set({ _hydrated: true });
          return;
        }

        // Ensure saved connections are loaded before validating tabs
        if (useConnectionStore.getState().connections.size === 0) {
          await useConnectionStore.getState().loadConnections();
        }
        const savedConnectionIds = new Set(
          Array.from(useConnectionStore.getState().connections.keys()),
        );

        let tabs: EditorTab[];
        let activeTabId: string | null;

        if (
          !backendState.migratedFromLocalStorage &&
          backendState.tabs.length === 0
        ) {
          // First launch after upgrade — try localStorage migration
          const migrated = await migrateFromLocalStorage();
          if (migrated && migrated.length > 0) {
            tabs = filterValidTabs(migrated, savedConnectionIds);
            activeTabId = migrateActiveTabId();
            // Clear localStorage and mark migration done
            localStorage.removeItem("tablepro-editor-tabs");
            void markLocalStorageMigrated().catch((err) =>
              console.error("Failed to mark migration:", err),
            );
          } else {
            tabs = [];
            activeTabId = null;
          }
        } else {
          // Normal restore from backend
          tabs = filterValidTabs(
            backendState.tabs.map(fromPersisted),
            savedConnectionIds,
          );
          activeTabId = backendState.activeTabId;
        }

        // Fix activeTabId if it points to a dropped tab
        if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
          activeTabId = tabs[0]?.id ?? null;
        }

        if (tabs.length > 0) {
          tabCounter = tabs.length + 1;
        }

        set({ tabs, activeTabId, _hydrated: true });
      },

      addTab: (title) => {
        const id = generateTabId();
        const connId = useConnectionStore.getState().selectedConnectionId ?? undefined;
        const newTab: EditorTab = {
          id,
          title: title ?? `Query ${get().tabs.length + 1}`,
          content: "",
          isDirty: false,
          isPreview: false,
          isPinned: false,
          type: 'query',
          connectionId: connId,
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
        return id;
      },

      /** Replace the existing preview tab (if any) or create a new preview tab. */
      addPreviewTab: (title) => {
        const existing = get().tabs.find((t) => t.isPreview);
        if (existing) {
          // Reuse the preview slot — update title + clear content
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === existing.id
                ? { ...t, title, content: "", isDirty: false }
                : t,
            ),
            activeTabId: existing.id,
          }));
          return existing.id;
        }
        const id = generateTabId();
        const previewTab: EditorTab = {
          id,
          title,
          content: "",
          isDirty: false,
          isPreview: true,
          isPinned: false,
          type: 'query',
        };
        set((s) => ({ tabs: [...s.tabs, previewTab], activeTabId: id }));
        return id;
      },

      /** Create or activate a table-browse tab. */
      addTableTab: (tableName, schema) => {
        const connId = useConnectionStore.getState().selectedConnectionId ?? undefined;
        // Check if a table tab for this table+schema+connection already exists
        const existing = get().tabs.find(
          (t) => t.type === 'table' && t.tableName === tableName
            && (t.tableSchema ?? undefined) === (schema ?? undefined)
            && t.connectionId === connId,
        );
        if (existing) {
          set({ activeTabId: existing.id });
          return existing.id;
        }
        // Check if there's a preview table tab — replace it
        const preview = get().tabs.find((t) => t.isPreview && t.type === 'table');
        if (preview) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === preview.id
                ? { ...t, title: tableName, tableName, tableSchema: schema ?? undefined, connectionId: connId, isDirty: false }
                : t,
            ),
            activeTabId: preview.id,
          }));
          return preview.id;
        }
        const id = generateTabId();
        const newTab: EditorTab = {
          id,
          title: tableName,
          content: "",
          isDirty: false,
          isPreview: false,
          isPinned: false,
          type: 'table',
          connectionId: connId,
          tableName,
          tableSchema: schema ?? undefined,
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
        return id;
      },

      /** Create a MongoDB query tab. */
      addMongoQueryTab: (title) => {
        const id = generateTabId();
        const connId = useConnectionStore.getState().selectedConnectionId ?? undefined;
        const newTab: EditorTab = {
          id,
          title: title ?? `Mongo Query ${get().tabs.length + 1}`,
          content: "",
          isDirty: false,
          isPreview: false,
          isPinned: false,
          type: 'mongoQuery',
          connectionId: connId,
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
        return id;
      },

      /** Create a Redis command tab. */
      addRedisCommandTab: (title) => {
        const id = generateTabId();
        const connId = useConnectionStore.getState().selectedConnectionId ?? undefined;
        const newTab: EditorTab = {
          id,
          title: title ?? `Redis ${get().tabs.length + 1}`,
          content: "",
          isDirty: false,
          isPreview: false,
          isPinned: false,
          type: 'redisCommand',
          connectionId: connId,
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
        return id;
      },

      /** Promote a preview tab to a permanent tab. */
      promoteTab: (id) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, isPreview: false } : t)),
        }));
      },

      closeTab: (id) => {
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          let activeTabId = s.activeTabId;
          if (activeTabId === id) {
            const idx = s.tabs.findIndex((t) => t.id === id);
            activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
          }
          releaseClosedTabStreams(s.tabs, tabs);
          syncSelectedConnectionByTabId(tabs, activeTabId);
          return { tabs, activeTabId };
        });
      },

      closeOtherTabs: (id) => {
        set((s) => {
          const kept = s.tabs.filter((t) => t.id === id || (t.isPinned ?? false));
          releaseClosedTabStreams(s.tabs, kept);
          syncSelectedConnectionByTabId(kept, id);
          return { tabs: kept, activeTabId: id };
        });
      },

      closeAllTabs: () => {
        set((s) => {
          const pinned = s.tabs.filter((t) => t.isPinned ?? false);
          const activeTabId = pinned[0]?.id ?? null;
          releaseClosedTabStreams(s.tabs, pinned);
          syncSelectedConnectionByTabId(pinned, activeTabId);
          return { tabs: pinned, activeTabId };
        });
      },

      closeTabsToRight: (id) => {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;
          const kept = s.tabs.filter((t, i) => i <= idx || (t.isPinned ?? false));
          releaseClosedTabStreams(s.tabs, kept);
          const activeTabId =
            s.activeTabId && kept.some((t) => t.id === s.activeTabId)
              ? s.activeTabId
              : id;
          syncSelectedConnectionByTabId(kept, activeTabId);
          return { tabs: kept, activeTabId };
        });
      },

      setActiveTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        const nextState: Partial<EditorState> = { activeTabId: id };
        if (tab) {
          if (tab.connectionId) {
            useConnectionStore.getState().selectConnection(tab.connectionId);
            // Background ping to detect stale connections
            const sessionId = useConnectionStore.getState().sessionIds.get(tab.connectionId);
            if (sessionId) {
              void commands.getConnectionStatus(sessionId).catch(() => {
                // Silently ignore — connection health will be surfaced via events
              });
            }
          } else {
            // Auto-associate unbound tab with the active connection if connected
            const activeConnId = useConnectionStore.getState().selectedConnectionId;
            if (activeConnId && tab.type === 'query') {
              tab.connectionId = activeConnId;
              setTimeout(() => {
                get().setTabConnectionId(id, activeConnId);
              }, 0);
            }
          }
        }
        set(nextState);
      },

      updateTabContent: (id, content) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  content,
                  isDirty: true,
                  // Auto-promote preview tab when user edits SQL
                  isPreview: false,
                }
              : t,
          ),
        }));
      },

      renameTab: (id, title) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
        }));
      },

      pinTab: (id) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, isPinned: true } : t)),
        }));
      },

      unpinTab: (id) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, isPinned: false } : t)),
        }));
      },

      setTabType: (id, type) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, type } : t)),
        }));
      },

      setTabConnectionId: (id, connectionId) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, connectionId } : t)),
        }));
      },
    }),
  ),
);

// Auto-save on state changes (tabs + activeTabId) after hydration
useEditorStore.subscribe(
  (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId }),
  () => {
    if (useEditorStore.getState()._hydrated) {
      debouncedSave();
    }
  },
  { equalityFn: Object.is },
);
