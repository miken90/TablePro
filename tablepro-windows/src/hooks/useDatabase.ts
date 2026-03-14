import { useConnectionStore } from "../stores/connectionStore";
import { useSchemaStore } from "../stores/schemaStore";

export function useDatabase() {
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);
  const getStatus = useConnectionStore((s) => s.getStatus);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);

  const tables = useSchemaStore((s) => s.tables);
  const databases = useSchemaStore((s) => s.databases);
  const selectedDatabase = useSchemaStore((s) => s.selectedDatabase);
  const schemaIsLoading = useSchemaStore((s) => s.isLoading);
  const fetchSchema = useSchemaStore((s) => s.fetchSchema);
  const fetchDatabases = useSchemaStore((s) => s.fetchDatabases);
  const clearSchema = useSchemaStore((s) => s.clearSchema);

  const activeConnection = selectedConnectionId
    ? connections.get(selectedConnectionId)
    : null;

  const connectionStatus = selectedConnectionId
    ? getStatus(selectedConnectionId)
    : "disconnected";

  const isConnected = connectionStatus === "connected";

  // Resolve Rust session UUID from SavedConnection ID
  const sessionId = selectedConnectionId
    ? getSessionId(selectedConnectionId)
    : undefined;

  const loadSchema = async () => {
    if (!sessionId) return;
    await fetchSchema(sessionId);
  };

  const loadDatabases = async () => {
    if (!sessionId) return;
    await fetchDatabases(sessionId);
  };

  const disconnectCurrent = async () => {
    if (!selectedConnectionId) return;
    await disconnect(selectedConnectionId);
    clearSchema();
  };

  return {
    selectedConnectionId,
    sessionId,
    activeConnection,
    connectionStatus,
    isConnected,
    connect,
    disconnectCurrent,
    tables,
    databases,
    selectedDatabase,
    schemaIsLoading,
    loadSchema,
    loadDatabases,
  };
}
