import { useCallback } from "react";
import { useConnectionStore } from "../stores/connectionStore";
import { useEditorStore } from "../stores/editorStore";
import { useQueryStore } from "../stores/queryStore";
import { activateQueryTab, openTableTab, syncActiveTabContext } from "../stores/active-tab-sync";

export function useTableCallbacks() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const addPreviewTab = useEditorStore((s) => s.addPreviewTab);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const setQueryText = useQueryStore((s) => s.setQueryText);

  const handleQuickSwitcherSelect = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        openTableTab(tableName, schema);
      }
    },
    [selectedConnectionId],
  );

  const handleOpenTable = useCallback(
    (tableName: string, schema?: string | null) => {
      if (selectedConnectionId) {
        openTableTab(tableName, schema);
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
      syncActiveTabContext(tabId);
      void useQueryStore.getState().execute(sid, selectQuery);
    },
    [selectedConnectionId, getSessionId, addPreviewTab, updateTabContent, setQueryText],
  );

  const handleHistorySelect = useCallback(
    (query: string) => {
      // A history pick lands in a query tab — the active one if it is one,
      // else the latest query tab, else a new one — never in a table or
      // structure tab where the SQL would be invisible.
      const tabId = activateQueryTab();
      updateTabContent(tabId, query);
      setQueryText(query);
    },
    [updateTabContent, setQueryText],
  );

  return {
    handleQuickSwitcherSelect,
    handleOpenTable,
    handleOpenPreviewTable,
    handleHistorySelect,
  };
}
