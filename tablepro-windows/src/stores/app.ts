import { create } from "zustand";
import type { DatabaseConnection, ConnectionGroup } from "../types";
import { getConnections, saveConnection as apiSaveConnection, deleteConnection as apiDeleteConnection, getGroups, saveGroup as apiSaveGroup, deleteGroup as apiDeleteGroup } from "../utils/api";

interface AppState {
  connections: DatabaseConnection[];
  groups: ConnectionGroup[];
  activeConnectionId: string | null;
  searchQuery: string;
  view: "welcome" | "main";
  serverVersion: string | null;

  setSearchQuery: (query: string) => void;
  setActiveConnectionId: (id: string | null) => void;
  setView: (view: "welcome" | "main") => void;
  setServerVersion: (version: string | null) => void;

  loadConnections: () => Promise<void>;
  addConnection: (connection: DatabaseConnection, password?: string) => Promise<void>;
  updateConnection: (connection: DatabaseConnection, password?: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;

  loadGroups: () => Promise<void>;
  addGroup: (group: ConnectionGroup) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  groups: [],
  activeConnectionId: null,
  searchQuery: "",
  view: "welcome",
  serverVersion: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveConnectionId: (id) => set({ activeConnectionId: id }),
  setView: (view) => set({ view }),
  setServerVersion: (version) => set({ serverVersion: version }),

  loadConnections: async () => {
    const connections = await getConnections();
    set({ connections });
  },

  addConnection: async (connection, password) => {
    await apiSaveConnection(connection, password);
    await get().loadConnections();
  },

  updateConnection: async (connection, password) => {
    await apiSaveConnection(connection, password);
    await get().loadConnections();
  },

  removeConnection: async (id) => {
    await apiDeleteConnection(id);
    await get().loadConnections();
    const state = get();
    if (state.activeConnectionId === id) {
      set({ activeConnectionId: null, view: "welcome" });
    }
  },

  loadGroups: async () => {
    const groups = await getGroups();
    set({ groups });
  },

  addGroup: async (group) => {
    await apiSaveGroup(group);
    await get().loadGroups();
  },

  removeGroup: async (id) => {
    await apiDeleteGroup(id);
    await get().loadGroups();
  },
}));
