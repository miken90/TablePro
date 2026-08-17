import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionGroup, ConnectionStatus, SavedConnection } from "../types/connection";
import type { ConnectionConfig } from "../types/connection";
import * as commands from "../ipc/commands";

import { useSettingsStore } from "./settingsStore";
import { useEditorStore } from "./editorStore";
import type { EditorTab } from "./editorStore";

interface ConnectionState {
  connections: Map<string, SavedConnection>;
  groups: Map<string, ConnectionGroup>;
  selectedConnectionId: string | null;
  connectionStatuses: Map<string, ConnectionStatus>;
  sessionIds: Map<string, string>; // SavedConnection id → Rust session UUID
  /** Per-connection reconnect guard — prevents double-tap reconnect. */
  reconnectingIds: Set<string>;

  // Tag & group filter state
  activeTagFilter: string[];
  activeGroupFilter: string | null;

  // Actions
  loadConnections: () => Promise<void>;
  loadGroups: () => Promise<void>;
  selectConnection: (id: string | null) => void;
  connect: (id: string, config: ConnectionConfig) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  reconnect: (connectionId: string) => Promise<void>;
  saveConnection: (connection: SavedConnection) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  saveGroup: (group: ConnectionGroup) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  getStatus: (id: string) => ConnectionStatus;
  getSessionId: (id: string) => string | undefined;
  /** Check if a specific connection is currently reconnecting. */
  isConnectionReconnecting: (id: string) => boolean;
  setTagFilter: (tags: string[]) => void;
  setGroupFilter: (group: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: new Map(),
  groups: new Map(),
  selectedConnectionId: null,
  connectionStatuses: new Map(),
  sessionIds: new Map(),
  reconnectingIds: new Set(),
  activeTagFilter: [],
  activeGroupFilter: null,

  loadConnections: async () => {
    const list = await commands.listConnections();
    const map = new Map(list.map((c) => [c.id, c]));

    // Restore persisted filter state
    let activeTagFilter: string[] = [];
    let activeGroupFilter: string | null = null;
    try {
      const rawTags = localStorage.getItem("tp:activeTagFilter");
      if (rawTags) activeTagFilter = JSON.parse(rawTags) as string[];
    } catch { /* ignore */ }
    try {
      const rawGroup = localStorage.getItem("tp:activeGroupFilter");
      if (rawGroup) activeGroupFilter = JSON.parse(rawGroup) as string | null;
    } catch { /* ignore */ }

    set({ connections: map, activeTagFilter, activeGroupFilter });
  },

  loadGroups: async () => {
    const list = await commands.listGroups();
    const map = new Map(list.map((g) => [g.id, g]));
    set({ groups: map });
  },

  selectConnection: (id) => set({ selectedConnectionId: id }),

  connect: async (id, config) => {
    set((s) => {
      const statuses = new Map(s.connectionStatuses);
      statuses.set(id, "connecting");
      return { connectionStatuses: statuses };
    });
    try {
      const sessionId = await commands.connect(config);
      set((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(id, "connected");
        const sessionIds = new Map(s.sessionIds);
        sessionIds.set(id, sessionId);
        return { connectionStatuses: statuses, sessionIds, selectedConnectionId: id };
      });

      // Auto-bind the active query tab only when it has no connection of its
      // own. A tab that names a connection keeps naming it even while that
      // connection is down: silently re-pointing it at whatever was connected
      // next meant a tab whose dev database had dropped could start running
      // its SQL against production. The stale binding is surfaced instead —
      // running in that tab reports that its connection is not connected.
      const activeTabId = useEditorStore.getState().activeTabId;
      if (activeTabId) {
        const activeTab = useEditorStore.getState().tabs.find((t: EditorTab) => t.id === activeTabId);
        if (activeTab && activeTab.type === 'query' && !activeTab.connectionId) {
          useEditorStore.getState().setTabConnectionId(activeTabId, id);
        }
      }
    } catch (err) {
      set((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(id, "error");
        return { connectionStatuses: statuses };
      });
      throw err;
    }
  },

  disconnect: async (id) => {
    const sessionId = get().sessionIds.get(id);
    if (sessionId) {
      await commands.disconnect(sessionId);
    }
    set((s) => {
      const statuses = new Map(s.connectionStatuses);
      statuses.set(id, "disconnected");
      const sessionIds = new Map(s.sessionIds);
      sessionIds.delete(id);
      const reconnectingIds = new Set(s.reconnectingIds);
      reconnectingIds.delete(id);
      return {
        connectionStatuses: statuses,
        sessionIds,
        reconnectingIds,
        selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId,
      };
    });
  },

  reconnect: async (connectionId: string) => {
    const state = get();
    const sessionId = state.sessionIds.get(connectionId);
    if (!sessionId) {
      return;
    }

    // Guard: prevent double-tap reconnect for the same connection
    if (state.reconnectingIds.has(connectionId)) {
      return;
    }

    set((s) => {
      const reconnectingIds = new Set(s.reconnectingIds);
      reconnectingIds.add(connectionId);
      const statuses = new Map(s.connectionStatuses);
      statuses.set(connectionId, "connecting");
      return { reconnectingIds, connectionStatuses: statuses };
    });

    try {
      await commands.reconnectSession(sessionId);
      // Success state is set by the connection:reconnected event listener
    } catch {
      set((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(connectionId, "error");
        return { connectionStatuses: statuses };
      });
    } finally {
      set((s) => {
        const reconnectingIds = new Set(s.reconnectingIds);
        reconnectingIds.delete(connectionId);
        return { reconnectingIds };
      });
    }
  },

  saveConnection: async (connection) => {
    await commands.saveConnection(connection);
    // Phase 3 Item 2: optionally mirror password into Windows Credential Manager.
    try {
      const useKeychain = useSettingsStore.getState().settings.rememberCredentialsInOsKeychain;
      const pwd = connection.config.password;
      if (useKeychain && pwd && pwd.length > 0) {
        await commands.credSave(connection.id, pwd);
      }
    } catch (e) {
      console.warn("cred_save failed (non-fatal):", e);
    }
    set((s) => {
      const connections = new Map(s.connections);
      connections.set(connection.id, connection);
      return { connections };
    });
  },

  deleteConnection: async (id) => {
    await commands.deleteConnection(id);
    // Always clean up CredMan entry (idempotent on missing entries).
    try {
      await commands.credDelete(id);
    } catch (e) {
      console.warn("cred_delete failed (non-fatal):", e);
    }
    set((s) => {
      const connections = new Map(s.connections);
      connections.delete(id);
      return { connections };
    });
  },

  saveGroup: async (group) => {
    await commands.saveGroup(group);
    set((s) => {
      const groups = new Map(s.groups);
      groups.set(group.id, group);
      return { groups };
    });
  },

  deleteGroup: async (id) => {
    await commands.deleteGroup(id);
    set((s) => {
      const groups = new Map(s.groups);
      groups.delete(id);
      // Clear groupId from affected connections in local state
      const connections = new Map(s.connections);
      for (const [connId, conn] of connections) {
        if (conn.groupId === id) {
          connections.set(connId, { ...conn, groupId: undefined });
        }
      }
      return { groups, connections };
    });
  },

  getStatus: (id) => get().connectionStatuses.get(id) ?? "disconnected",
  getSessionId: (id) => get().sessionIds.get(id),
  isConnectionReconnecting: (id) => get().reconnectingIds.has(id),
  setTagFilter: (tags) => {
    set({ activeTagFilter: tags });
    try { localStorage.setItem("tp:activeTagFilter", JSON.stringify(tags)); } catch { /* ignore */ }
  },
  setGroupFilter: (group) => {
    set({ activeGroupFilter: group });
    try { localStorage.setItem("tp:activeGroupFilter", JSON.stringify(group)); } catch { /* ignore */ }
  },
}));

// Auto-subscribe to connection events from Rust backend
if (typeof window !== "undefined") {
void listen<{ sessionId: string; host?: string }>("connection:lost", (event) => {
  const { sessionId } = event.payload;
  const state = useConnectionStore.getState();
  for (const [connId, sid] of state.sessionIds) {
    if (sid === sessionId) {
      useConnectionStore.setState((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(connId, "error");
        // Clear reconnecting flag — if a reconnect was in flight and the
        // connection was lost again, the guard must be reset so the user
        // can retry.
        const reconnectingIds = new Set(s.reconnectingIds);
        reconnectingIds.delete(connId);
        return { connectionStatuses: statuses, reconnectingIds };
      });
      break;
    }
  }
});

void listen<{ sessionId: string }>("connection:reconnected", (event) => {
  const { sessionId } = event.payload;
  const state = useConnectionStore.getState();
  for (const [connId, sid] of state.sessionIds) {
    if (sid === sessionId) {
      useConnectionStore.setState((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(connId, "connected");
        const reconnectingIds = new Set(s.reconnectingIds);
        reconnectingIds.delete(connId);
        return { connectionStatuses: statuses, reconnectingIds };
      });
      break;
    }
  }
});
}
