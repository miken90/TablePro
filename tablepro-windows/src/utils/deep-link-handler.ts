import { toast } from "sonner";
import { useConnectionStore } from "../stores/connectionStore";

// ---------------------------------------------------------------------------
// Deep-link URL parser and handler for `tablepro://` protocol.
//
// Supported routes:
//   tablepro://open/connection/{connection-id}
//
// On receive: look up saved connection by ID, trigger connect flow.
// If not found: show error toast. Never crash on malformed URLs.
// ---------------------------------------------------------------------------

export interface DeepLinkAction {
  type: "open-connection";
  connectionId: string;
}

/**
 * Parse a `tablepro://` URL into a structured action.
 * Returns null for unrecognised or malformed URLs.
 */
export function parseDeepLinkUrl(raw: string): DeepLinkAction | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "tablepro:") return null;

  // URL constructor normalises `tablepro://open/connection/abc` so that
  // `url.hostname` = "open" and `url.pathname` = "/connection/abc".
  // Reconstruct the full path for easier matching.
  const fullPath = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
  const segments = fullPath.split("/").filter(Boolean);

  // tablepro://open/connection/{id}
  if (segments.length === 3 && segments[0] === "open" && segments[1] === "connection") {
    const connectionId = decodeURIComponent(segments[2]);
    if (connectionId) {
      return { type: "open-connection", connectionId };
    }
  }

  return null;
}

/**
 * Resolve a connection ID to a SavedConnection from the store.
 */
function resolveConnection(id: string) {
  return useConnectionStore.getState().connections.get(id);
}

/**
 * Handle a parsed deep-link action. Shows appropriate toasts on error.
 */
export async function handleDeepLinkAction(action: DeepLinkAction): Promise<void> {
  if (action.type === "open-connection") {
    const store = useConnectionStore.getState();

    // Ensure connections are loaded
    if (store.connections.size === 0) {
      await store.loadConnections();
    }

    const connection = resolveConnection(action.connectionId);
    if (!connection) {
      toast.error("Connection not found", {
        description: `No saved connection with ID "${action.connectionId}".`,
      });
      return;
    }

    // If already connected, just select it
    const status = store.getStatus(connection.id);
    if (status === "connected") {
      store.selectConnection(connection.id);
      toast.info("Connection already active", { description: connection.name });
      return;
    }

    // Trigger connect flow
    try {
      await store.connect(connection.id, connection.config);
    } catch {
      // connect() already shows an error toast via the store
    }
  }
}

/**
 * Process a raw deep-link URL string end-to-end.
 * Safe to call with any input — logs and toasts on error.
 */
export async function handleDeepLinkUrl(raw: string): Promise<void> {
  const action = parseDeepLinkUrl(raw);
  if (!action) {
    toast.error("Unrecognised link", {
      description: "This tablepro:// link is not supported.",
    });
    return;
  }
  await handleDeepLinkAction(action);
}
