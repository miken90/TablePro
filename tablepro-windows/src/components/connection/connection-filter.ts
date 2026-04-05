import { engineLabel } from "./engine-icon";
import { useConnectionStore } from "../../stores/connectionStore";
import type { SavedConnection } from "../../types/connection";

export interface ConnectionFilterCriteria {
  searchTerm: string;
  tags: string[];
  group: string | null;
}

/**
 * Filter connections by search term, tags, and group.
 * When called with a plain string, automatically applies the active tag/group
 * filters from connectionStore so callers don't need to pass them explicitly.
 */
export function filterConnections(
  connections: SavedConnection[],
  queryOrCriteria: string | ConnectionFilterCriteria,
): SavedConnection[] {
  let criteria: ConnectionFilterCriteria;

  if (typeof queryOrCriteria === "string") {
    const state = useConnectionStore.getState();
    criteria = {
      searchTerm: queryOrCriteria,
      tags: state.activeTagFilter,
      group: state.activeGroupFilter,
    };
  } else {
    criteria = queryOrCriteria;
  }

  return connections.filter((c) => {
    if (!matchesSearch(c, criteria.searchTerm)) return false;
    if (!matchesTags(c, criteria.tags)) return false;
    if (!matchesGroup(c, criteria.group)) return false;
    return true;
  });
}

function matchesSearch(c: SavedConnection, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    c.name.toLowerCase().includes(q) ||
    c.config.host.toLowerCase().includes(q) ||
    c.config.database.toLowerCase().includes(q) ||
    engineLabel(c.config.dbType).toLowerCase().includes(q) ||
    (c.tag?.toLowerCase().includes(q) ?? false)
  );
}

function matchesTags(c: SavedConnection, tags: string[]): boolean {
  if (tags.length === 0) return true;
  return tags.some((t) => c.tag?.toLowerCase() === t.toLowerCase());
}

function matchesGroup(c: SavedConnection, group: string | null): boolean {
  if (group === null) return true;
  return c.groupId === group;
}
