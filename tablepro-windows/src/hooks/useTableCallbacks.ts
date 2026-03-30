import { useCallback } from "react";
import { useConnectionStore } from "../stores/connectionStore";
import { useEditorStore } from "../stores/editorStore";
import { useQueryStore } from "../stores/queryStore";
import { useLayoutStore } from "../stores/layoutStore";

export function useTableCallbacks() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const addPreviewTab = useEditorStore((s) => s.addPreviewTab);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const setQueryText = useQueryStore((s) => s.setQueryText);

  const handleQuickSwitcherSelect = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        useLayoutStore.getState().openTable(tableName, schema);
      }
    },
    [selectedConnectionId],
  );

  const handleOpenTable = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        useLayoutStore.getState().openTable(tableName, schema);
      }
    },
    [selectedConnectionId],
  );

  const handleOpenPreviewTable = useCallback(
    (tableName: string, schema?: string | null) => {
      if (!selectedConnectionId) return;
      const sid = getSessionId(selectedConnectionId);
      if (!sid) return;
      const qualifiedName = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
      const selectQuery = `SELECT * FROM ${qualifiedName} LIMIT 100;`;
      const tabId = addPreviewTab(tableName);
      updateTabContent(tabId, selectQuery);
      setQueryText(selectQuery);
      useLayoutStore.getState().switchToQueryMode();
      void useQueryStore.getState().execute(sid, selectQuery);
    },
    [selectedConnectionId, getSessionId, addPreviewTab, updateTabContent, setQueryText],
  );

  const handleHistorySelect = useCallback(
    (query: string) => {
      if (activeTabId) {
        updateTabContent(activeTabId, query);
      } else {
        const tabId = addTab("Query");
        updateTabContent(tabId, query);
      }
      setQueryText(query);
      useLayoutStore.getState().switchToQueryMode();
    },
    [activeTabId, addTab, updateTabContent, setQueryText],
  );

  return {
    handleQuickSwitcherSelect,
    handleOpenTable,
    handleOpenPreviewTable,
    handleHistorySelect,
  };
}
