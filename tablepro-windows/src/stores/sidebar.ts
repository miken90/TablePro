import { create } from "zustand";
import type { SidebarNode, TableInfo } from "../types";
import { fetchTables, fetchDatabases } from "../utils/api";

interface SidebarState {
  nodes: SidebarNode[];
  expandedIds: Set<string>;
  selectedId: string | null;
  activeDatabase: string | null;
  databases: string[];
  loading: boolean;

  loadDatabases: (connectionId: string) => Promise<void>;
  loadTables: (connectionId: string) => Promise<void>;
  setActiveDatabase: (db: string | null) => void;
  toggleExpanded: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  reset: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  nodes: [],
  expandedIds: new Set<string>(),
  selectedId: null,
  activeDatabase: null,
  databases: [],
  loading: false,

  loadDatabases: async (connectionId) => {
    try {
      const databases = await fetchDatabases(connectionId);
      set({ databases });
    } catch {
      set({ databases: [] });
    }
  },

  loadTables: async (connectionId) => {
    set({ loading: true });
    try {
      const tables = await fetchTables(connectionId);
      const tableNodes: SidebarNode[] = tables
        .filter((t: TableInfo) => t.table_type === "TABLE")
        .map((t: TableInfo) => ({
          id: `table:${t.name}`,
          name: t.name,
          nodeType: "table" as const,
          rowCount: t.row_count,
        }));
      const viewNodes: SidebarNode[] = tables
        .filter((t: TableInfo) => t.table_type === "VIEW")
        .map((t: TableInfo) => ({
          id: `view:${t.name}`,
          name: t.name,
          nodeType: "view" as const,
        }));

      const nodes: SidebarNode[] = [];
      if (tableNodes.length > 0) {
        nodes.push({
          id: "section:tables",
          name: "Tables",
          nodeType: "database",
          children: tableNodes,
        });
      }
      if (viewNodes.length > 0) {
        nodes.push({
          id: "section:views",
          name: "Views",
          nodeType: "database",
          children: viewNodes,
        });
      }
      set({ nodes, loading: false, expandedIds: new Set(["section:tables", "section:views"]) });
    } catch {
      set({ nodes: [], loading: false });
    }
  },

  setActiveDatabase: (db) => set({ activeDatabase: db }),
  toggleExpanded: (id) => {
    set((s) => {
      const next = new Set(s.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    });
  },
  setSelectedId: (id) => set({ selectedId: id }),
  reset: () =>
    set({
      nodes: [],
      expandedIds: new Set(),
      selectedId: null,
      activeDatabase: null,
      databases: [],
      loading: false,
    }),
}));
