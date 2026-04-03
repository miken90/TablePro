import { invoke } from "@tauri-apps/api/core";

export interface PersistedTab {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  connectionId: string | null;
  tabType: string;
  tableName: string | null;
  tableSchema: string | null;
}

export interface TabStateFile {
  version: number;
  migratedFromLocalStorage: boolean;
  tabs: PersistedTab[];
  activeTabId: string | null;
}

export function loadTabState(): Promise<TabStateFile> {
  return invoke<TabStateFile>("get_tab_state");
}

export function saveTabState(state: TabStateFile): Promise<void> {
  return invoke("set_tab_state", { state });
}

export function markLocalStorageMigrated(): Promise<void> {
  return invoke("mark_localstorage_migrated");
}
