import { useCallback, useRef } from "react";
import { ConnectionGroupSection } from "./ConnectionGroupSection";
import { ConnectionCard } from "./connection-card";
import type { ConnectionGroup, SavedConnection, ConnectionStatus } from "../../types/connection";

interface ConnectionListProps {
  groupList: ConnectionGroup[];
  allConnections: SavedConnection[];
  filteredConnIds: Set<string>;
  ungrouped: SavedConnection[];
  connectingId: string | null;
  isSearching: boolean;
  getStatus: (id: string) => ConnectionStatus;
  onConnect: (conn: SavedConnection) => void;
  onEdit: (conn: SavedConnection) => void;
  onDelete: (conn: SavedConnection) => Promise<void>;
  onDuplicate: (conn: SavedConnection) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
}

export function ConnectionList({
  groupList, allConnections, filteredConnIds, ungrouped, connectingId,
  isSearching, getStatus, onConnect, onEdit, onDelete, onDuplicate, onDeleteGroup,
}: ConnectionListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const container = listRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-connect-btn]"),
    );
    if (buttons.length === 0) return;

    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown"
      ? (idx + 1) % buttons.length
      : (idx - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }, []);

  return (
    <div ref={listRef} className="w-full space-y-2" onKeyDown={handleKeyDown}>
      {groupList.map((group) => {
        const groupConns = allConnections
          .filter((c) => c.groupId === group.id)
          .filter((c) => filteredConnIds.has(c.id));
        if (isSearching && groupConns.length === 0) return null;
        return (
          <ConnectionGroupSection
            key={group.id}
            group={group}
            connections={groupConns}
            connectingId={connectingId}
            getStatus={getStatus}
            onConnect={onConnect}
            onEdit={onEdit}
            onDelete={() => void onDeleteGroup(group.id)}
            onDeleteConnection={onDelete}
            onDuplicateConnection={onDuplicate}
          />
        );
      })}

      {ungrouped.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Connections</p>
          <div className="flex flex-col gap-1">
            {ungrouped.map((conn) => (
              <ConnectionCard
                key={conn.id}
                conn={conn}
                connectingId={connectingId}
                status={getStatus(conn.id)}
                onConnect={() => onConnect(conn)}
                onEdit={() => onEdit(conn)}
                onDelete={() => void onDelete(conn)}
                onDuplicate={() => void onDuplicate(conn)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
