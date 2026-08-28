import type { EditorTab } from "../../stores/editorStore";

/** Everything about the connection that decides what a tab kind renders as. */
export interface WorkspaceEngine {
  /** A connection is selected. */
  isConnected: boolean;
  /** The session handle, once the connection handshake has finished. */
  sessionId: string | undefined;
  /** MongoDB: collections, no SQL editor. */
  isDocumentDb: boolean;
  /** Redis: key/value, no SQL editor. */
  isKeyValueDb: boolean;
}

export type WorkspaceViewKind =
  | "welcome"
  | "query"
  | "mongoQuery"
  | "redisCommand"
  | "table"
  | "structure"
  /** A structure tab whose session handshake has not finished yet. */
  | "connecting"
  /** A tab this connection cannot host (engine-changed or edited tab-state). */
  | "unsupported";

export interface WorkspaceView {
  kind: WorkspaceViewKind;
  tableName?: string;
  schema?: string | undefined;
  /** For `unsupported`: why, in words the empty state can show. */
  reason?: string;
}

/**
 * The routing table: active tab × engine → what the workspace body renders.
 * Pure so it can be tested exhaustively without a DOM. The tab kind is the
 * only view state; nothing else decides this.
 *
 * Editor kinds (query / mongoQuery / redisCommand) all resolve by engine —
 * a query tab on a Redis connection shows the Redis panel, exactly as the
 * shell did before structure became a tab kind. A table tab renders the grid
 * on every engine (Mongo browses collections). Structure needs a SQL engine
 * and a live session.
 */
export function resolveWorkspaceView(
  tab: EditorTab | null | undefined,
  engine: WorkspaceEngine,
): WorkspaceView {
  if (!engine.isConnected) return { kind: "welcome" };

  const kind = tab?.type ?? "query";

  switch (kind) {
    case "query":
    case "mongoQuery":
    case "redisCommand":
      if (engine.isKeyValueDb) return { kind: "redisCommand" };
      if (engine.isDocumentDb) return { kind: "mongoQuery" };
      return { kind: "query" };

    case "table":
      if (!tab?.tableName) return { kind: "unsupported", reason: "This table tab has no table." };
      return { kind: "table", tableName: tab.tableName, schema: tab.tableSchema };

    case "structure":
      if (!tab?.tableName) return { kind: "unsupported", reason: "This structure tab has no table." };
      if (engine.isDocumentDb || engine.isKeyValueDb) {
        return { kind: "unsupported", reason: "This connection has no table structure to show." };
      }
      if (!engine.sessionId) return { kind: "connecting", tableName: tab.tableName, schema: tab.tableSchema };
      return { kind: "structure", tableName: tab.tableName, schema: tab.tableSchema };

    default:
      return { kind: "unsupported", reason: "This tab can't be shown on this connection." };
  }
}
