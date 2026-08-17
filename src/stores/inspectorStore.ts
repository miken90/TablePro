import { create } from "zustand";
import type { ColumnInfo } from "../types/query";

interface InspectorState {
  columns: ColumnInfo[];
  row: (string | null)[] | null;
  setInspectorData: (columns: ColumnInfo[], row: (string | null)[] | null) => void;
  clearInspectorData: () => void;
}

export const useInspectorStore = create<InspectorState>((set) => ({
  columns: [],
  row: null,
  setInspectorData: (columns, row) => set({ columns, row }),
  clearInspectorData: () => set({ columns: [], row: null }),
}));
