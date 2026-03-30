/**
 * QueryAnnouncer — listens to query/connection state changes
 * and posts announcements to the #sr-announcer live region.
 *
 * This component renders nothing visible. Mount it once in MainLayout.
 */
import { useEffect, useRef } from "react";
import { useQueryStore } from "../../stores/queryStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useAnnounce } from "../../hooks/useAnnounce";

export function QueryAnnouncer() {
  const { announce } = useAnnounce();
  const result = useQueryStore((s) => s.result);
  const isExecuting = useQueryStore((s) => s.isExecuting);
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const getStatus = useConnectionStore((s) => s.getStatus);

  const prevExecutingRef = useRef(false);
  const prevConnectionIdRef = useRef<string | null>(null);

  // Announce when query finishes executing
  useEffect(() => {
    if (prevExecutingRef.current && !isExecuting && result) {
      const rowCount = result.rows.length;
      announce(`Query completed, ${rowCount} row${rowCount !== 1 ? "s" : ""} returned`);
    }
    prevExecutingRef.current = isExecuting;
  }, [isExecuting, result, announce]);

  // Announce connection changes
  useEffect(() => {
    const prev = prevConnectionIdRef.current;
    if (prev !== selectedConnectionId) {
      if (selectedConnectionId) {
        const conn = connections.get(selectedConnectionId);
        const status = getStatus(selectedConnectionId);
        if (conn && status === "connected") {
          announce(`Connected to ${conn.name}`, "assertive");
        }
      } else if (prev) {
        const conn = connections.get(prev);
        announce(`Disconnected${conn ? ` from ${conn.name}` : ""}`, "assertive");
      }
      prevConnectionIdRef.current = selectedConnectionId;
    }
  }, [selectedConnectionId, connections, getStatus, announce]);

  return null;
}
