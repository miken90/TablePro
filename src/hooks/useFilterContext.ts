import { useEffect, useMemo } from "react";
import { useFilterStore } from "../stores/filterStore";
import { useSchemaStore } from "../stores/schemaStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useConnectionStore } from "../stores/connectionStore";

function combineWhereClauses(filterClause: string, quickSearchClause: string): string {
  const parts = [filterClause, quickSearchClause].filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `(${parts[0]}) AND (${parts[1]})`;
}

export function useFilterContext(
  viewMode: string,
  activeTableContext: { tableName: string; schema?: string | null } | null,
  activeTabId: string | null,
) {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const fetchColumns = useSchemaStore((s) => s.fetchColumns);

  const filterTabId = useMemo(() => {
    if (viewMode === "table-browse" && activeTableContext?.tableName) {
      return `table:${activeTableContext.tableName}`;
    }
    return activeTabId ?? "default";
  }, [viewMode, activeTableContext, activeTabId]);

  const filterByTab = useFilterStore((s) => s.byTab);
  const activeWhereClause = useMemo(() => {
    const tab = filterByTab[filterTabId];
    if (!tab) return "";
    return combineWhereClauses(tab.appliedFilterClause, tab.quickSearchClause);
  }, [filterByTab, filterTabId]);

  useEffect(() => {
    if (!activeTableContext?.tableName || !selectedConnectionId) {
      useLayoutStore.getState().setFilterColumns([]);
      return;
    }
    const sid = getSessionId(selectedConnectionId);
    if (!sid) return;
    fetchColumns(sid, activeTableContext.tableName, activeTableContext.schema ?? undefined)
      .then((cols) => useLayoutStore.getState().setFilterColumns(cols))
      .catch(() => useLayoutStore.getState().setFilterColumns([]));
  }, [activeTableContext, selectedConnectionId, getSessionId, fetchColumns]);

  return { filterTabId, activeWhereClause };
}
