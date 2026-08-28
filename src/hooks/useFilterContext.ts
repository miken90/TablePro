import { useEffect, useMemo } from "react";
import { useFilterStore } from "../stores/filterStore";
import { useSchemaStore } from "../stores/schemaStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useConnectionStore } from "../stores/connectionStore";
import type { EditorTab } from "../stores/editorStore";

function combineWhereClauses(filterClause: string, quickSearchClause: string): string {
  const parts = [filterClause, quickSearchClause].filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `(${parts[0]}) AND (${parts[1]})`;
}

/**
 * Filter state is keyed by the active tab: `table:<name>` for a table tab
 * (so presets and the applied clause follow the table, not the tab id) and
 * the tab id for everything else. The columns the filter panel offers are
 * fetched for the active table tab and published on `layoutStore`.
 */
export function useFilterContext(activeTab: EditorTab | null | undefined) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const fetchColumns = useSchemaStore((s) => s.fetchColumns);

  const tableName = activeTab?.type === "table" ? activeTab.tableName : undefined;
  const tableSchema = activeTab?.type === "table" ? activeTab.tableSchema : undefined;
  const activeTabId = activeTab?.id ?? null;

  const filterTabId = useMemo(() => {
    if (tableName) return `table:${tableName}`;
    return activeTabId ?? "default";
  }, [tableName, activeTabId]);

  const filterByTab = useFilterStore((s) => s.byTab);
  const activeWhereClause = useMemo(() => {
    const tab = filterByTab[filterTabId];
    if (!tab) return "";
    return combineWhereClauses(tab.appliedFilterClause, tab.quickSearchClause);
  }, [filterByTab, filterTabId]);

  useEffect(() => {
    if (!tableName || !selectedConnectionId) {
      useLayoutStore.getState().setFilterColumns([]);
      return;
    }
    const sid = getSessionId(selectedConnectionId);
    if (!sid) return;
    fetchColumns(sid, tableName, tableSchema ?? undefined)
      .then((cols) => useLayoutStore.getState().setFilterColumns(cols))
      .catch(() => useLayoutStore.getState().setFilterColumns([]));
  }, [tableName, tableSchema, selectedConnectionId, getSessionId, fetchColumns]);

  return { filterTabId, activeWhereClause };
}
