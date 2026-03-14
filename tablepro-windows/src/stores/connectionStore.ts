import { create } from "zustand";
import type { SavedConnection, ConnectionStatus } from "../types/connection";
import type { ConnectionConfig } from "../types/connection";
import * as commands from "../ipc/commands";

interface ConnectionState {
  connections: Map<string, SavedConnection>;
  selectedConnectionId: string | null;
  connectionStatuses: Map<string, ConnectionStatus>;
  sessionIds: Map<string, string>; // SavedConnection id → Rust session UUID

  // Actions
  loadConnections: () => Promise<void>;
  selectConnection: (id: string | null) => void;
  connect: (id: string, config: ConnectionConfig) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  saveConnection: (connection: SavedConnection) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  getStatus: (id: string) => ConnectionStatus;
  getSessionId: (id: string) => string | undefined;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: new Map(),
  selectedConnectionId: null,
  connectionStatuses: new Map(),
  sessionIds: new Map(),

  loadConnections: async () => {
    const list = await commands.listConnections();
    const map = new Map(list.map((c) => [c.id, c]));
    set({ connections: map });
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
      return {
        connectionStatuses: statuses,
        sessionIds,
        selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId,
      };
    });
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

  getStatus: (id) => get().connectionStatuses.get(id) ?? "disconnected",
  getSessionId: (id) => get().sessionIds.get(id),
}));
