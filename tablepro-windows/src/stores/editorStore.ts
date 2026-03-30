import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useConnectionStore } from "./connectionStore";
import * as commands from "../ipc/commands";

export type TabType = 'query' | 'table' | 'structure';

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

  // Actions
  addTab: (title?: string) => string;
  addPreviewTab: (title: string) => string;
  addTableTab: (tableName: string, schema?: string | null) => string;
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

function syncSelectedConnectionByTabId(tabs: EditorTab[], tabId: string | null): void {
  if (!tabId) return;
  const connectionId = tabs.find((tab) => tab.id === tabId)?.connectionId;
  if (connectionId) {
    useConnectionStore.getState().selectConnection(connectionId);
  }
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

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
          syncSelectedConnectionByTabId(tabs, activeTabId);
          return { tabs, activeTabId };
        });
      },

      closeOtherTabs: (id) => {
        set((s) => {
          const kept = s.tabs.filter((t) => t.id === id || (t.isPinned ?? false));
          syncSelectedConnectionByTabId(kept, id);
          return { tabs: kept, activeTabId: id };
        });
      },

      closeAllTabs: () => {
        set((s) => {
          const pinned = s.tabs.filter((t) => t.isPinned ?? false);
          const activeTabId = pinned[0]?.id ?? null;
          syncSelectedConnectionByTabId(pinned, activeTabId);
          return { tabs: pinned, activeTabId };
        });
      },

      closeTabsToRight: (id) => {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;
          const kept = s.tabs.filter((t, i) => i <= idx || (t.isPinned ?? false));
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
        if (tab?.connectionId) {
          useConnectionStore.getState().selectConnection(tab.connectionId);
          // Background ping to detect stale connections
          const sessionId = useConnectionStore.getState().sessionIds.get(tab.connectionId);
          if (sessionId) {
            void commands.getConnectionStatus(sessionId).catch(() => {
              // Silently ignore — connection health will be surfaced via events
            });
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
    {
      name: "tablepro-editor-tabs",
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          content: t.content.slice(0, 100_000),
          isDirty: false,
          // Don't persist preview state — rehydrate as permanent
          isPreview: false,
          isPinned: t.isPinned ?? false,
          connectionId: t.connectionId,
          type: t.type ?? 'query',
          tableName: t.tableName,
          tableSchema: t.tableSchema,
        })),
        activeTabId: state.activeTabId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.tabs.length) {
          tabCounter = state.tabs.length + 1;
          // Migrate: add defaults + filter orphaned table tabs
          state.tabs = state.tabs
            .filter((t) => {
              // Remove table tabs missing tableName (orphaned)
              if ((t.type ?? 'query') === 'table' && !t.tableName) return false;
              return true;
            })
            .map((t) => ({
              ...t,
              isPinned: t.isPinned ?? false,
              type: t.type ?? 'query',
            }));
        }
      },
    }
  )
);
