import { engineLabel } from "./engine-icon";
import type { SavedConnection } from "../../types/connection";

export function filterConnections(connections: SavedConnection[], query: string): SavedConnection[] {
  if (!query.trim()) return connections;
  const q = query.toLowerCase();
  return connections.filter((c) =>
    c.name.toLowerCase().includes(q) ||
    c.config.host.toLowerCase().includes(q) ||
    c.config.database.toLowerCase().includes(q) ||
    engineLabel(c.config.dbType).toLowerCase().includes(q) ||
    (c.tag?.toLowerCase().includes(q) ?? false)
  );
}
