import { useConnectionStore } from "../stores/connectionStore";

// ---------------------------------------------------------------------------
// Deep-link URL parser and handler for `tablepro://` protocol.
//
// Supported routes:
//   tablepro://open/connection/{connection-id}
//
// On receive: look up saved connection by ID, trigger connect flow.
// If not found: log error. Never crash on malformed URLs.
// ---------------------------------------------------------------------------

export type DeepLinkAction =
  | { type: "open-connection"; connectionId: string }
  | { type: "import-connection"; params: Record<string, string> };

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

  // tablepro://import?name=...&host=...&port=...&type=...
  if (segments.length >= 1 && segments[0] === "import") {
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }
    if (params.name || params.host) {
      return { type: "import-connection", params };
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
 * Handle a parsed deep-link action.
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
      console.error(`[deep-link] Connection not found: ${action.connectionId}`);
      return;
    }

    // If already connected, just select it
    const status = store.getStatus(connection.id);
    if (status === "connected") {
      store.selectConnection(connection.id);
      return;
    }

    // Trigger connect flow
    try {
      await store.connect(connection.id, connection.config);
    } catch {
      // connect() already handles error state via the store
    }
  }

  if (action.type === "import-connection") {
    const { params } = action;
    const store = useConnectionStore.getState();

    // Check for duplicate
    if (params.name) {
      const existing = Array.from(store.connections.values()).find(
        (c) => c.name.toLowerCase() === params.name.toLowerCase(),
      );
      if (existing) {
        console.warn(`[deep-link] Connection already exists: ${params.name}`);
        return;
      }
    }

    // Create and save the connection
    const conn = {
      id: crypto.randomUUID(),
      name: params.name || params.host || "Imported",
      config: {
        host: params.host || "",
        port: params.port ? parseInt(params.port, 10) : 5432,
        user: params.username || "",
        password: "",
        database: params.database || "",
        dbType: params.type || "PostgreSQL",
        sslMode: "",
        sshEnabled: false,
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshAuthMethod: "password",
        sshPassword: "",
        sshKeyPath: "",
        sshKeyPassphrase: "",
      },
    };

    try {
      await store.saveConnection(conn);
    } catch {
      console.error("[deep-link] Failed to import connection");
    }
  }
}

/**
 * Process a raw deep-link URL string end-to-end.
 * Safe to call with any input — logs on error.
 */
export async function handleDeepLinkUrl(raw: string): Promise<void> {
  const action = parseDeepLinkUrl(raw);
  if (!action) {
    console.error("[deep-link] Unrecognised link:", raw);
    return;
  }
  await handleDeepLinkAction(action);
}
