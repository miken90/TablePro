import { create } from "zustand";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionGroup, ConnectionStatus, SavedConnection } from "../types/connection";
import type { ConnectionConfig } from "../types/connection";
import * as commands from "../ipc/commands";
import { extractErrorMessage } from "../ipc/error";

interface ConnectionState {
  connections: Map<string, SavedConnection>;
  groups: Map<string, ConnectionGroup>;
  selectedConnectionId: string | null;
  connectionStatuses: Map<string, ConnectionStatus>;
  sessionIds: Map<string, string>; // SavedConnection id → Rust session UUID
  /** Per-connection reconnect guard — prevents double-tap reconnect. */
  reconnectingIds: Set<string>;

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
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: new Map(),
  groups: new Map(),
  selectedConnectionId: null,
  connectionStatuses: new Map(),
  sessionIds: new Map(),
  reconnectingIds: new Set(),

  loadConnections: async () => {
    const list = await commands.listConnections();
    const map = new Map(list.map((c) => [c.id, c]));
    set({ connections: map });
  },

  loadGroups: async () => {
    const list = await commands.listGroups();
    const map = new Map(list.map((g) => [g.id, g]));
    set({ groups: map });
  },

  selectConnection: (id) => set({ selectedConnectionId: id }),

  connect: async (id, config) => {
    const loadingId = toast.loading("Connecting...");
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
      toast.dismiss(loadingId);
      toast.success("Connected", { description: config.host ?? config.database ?? undefined });
    } catch (err) {
      set((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(id, "error");
        return { connectionStatuses: statuses };
      });
      toast.dismiss(loadingId);
      const msg = extractErrorMessage(err);
      toast.error("Connection failed", { description: msg, duration: Infinity });
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
    toast.info("Disconnected");
  },

  reconnect: async (connectionId: string) => {
    const state = get();
    const sessionId = state.sessionIds.get(connectionId);
    if (!sessionId) {
      toast.error("Reconnect failed", { description: "No active session for this connection" });
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
    } catch (err) {
      set((s) => {
        const statuses = new Map(s.connectionStatuses);
        statuses.set(connectionId, "error");
        return { connectionStatuses: statuses };
      });
      const msg = extractErrorMessage(err);
      toast.error("Reconnect failed", { description: msg });
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
    set((s) => {
      const connections = new Map(s.connections);
      connections.set(connection.id, connection);
      return { connections };
    });
  },

  deleteConnection: async (id) => {
    await commands.deleteConnection(id);
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
}));

// Auto-subscribe to connection events from Rust backend
if (typeof window !== "undefined") {
void listen<{ sessionId: string; host?: string }>("connection:lost", (event) => {
  const { sessionId, host } = event.payload;
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
      toast.error("Connection lost", {
        description: host ?? "Database connection was lost",
        duration: Infinity,
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
      toast.success("Connection restored");
      break;
    }
  }
});
}
