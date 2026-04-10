import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Database as DatabaseIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { useConnectionStore } from "../../stores/connectionStore";
import { ConnectionForm } from "./ConnectionForm";
import { ConnectionList } from "./connection-list";
import { ConnectionSearch } from "./connection-search";
import { ConnectionExportDialog } from "./connection-export-dialog";
import { ConnectionImportDialog } from "./connection-import-dialog";
import { EmptyState } from "../shared/EmptyState";
import { filterConnections } from "./connection-filter";
import { buildImportLink } from "../../ipc/commands";
import type { SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";
import logoIcon from "../../assets/logo-icon.svg";

declare const __APP_VERSION__: string;

export function WelcomeView() {
  const { connections, groups, loadConnections, loadGroups, connect, getStatus, deleteGroup, deleteConnection, saveConnection, saveGroup, activeTagFilter, activeGroupFilter, setTagFilter, setGroupFilter } =
    useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<SavedConnection | undefined>();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [exportIds, setExportIds] = useState<string[] | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    void loadConnections();
    void loadGroups();
  }, [loadConnections, loadGroups]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingConn(undefined);
  }, []);

  // Keyboard: Ctrl+N for new connection, Escape to close form
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showForm) { closeForm(); return; }
      if (e.ctrlKey && e.key === "n" && !showForm) {
        e.preventDefault();
        setEditingConn(undefined);
        setShowForm(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showForm, closeForm]);

  const handleConnect = useCallback(async (conn: SavedConnection) => {
    setConnectingId(conn.id);
    setError(null);
    try {
      await connect(conn.id, conn.config);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setConnectingId(null);
    }
  }, [connect]);

  const handleEdit = useCallback((conn: SavedConnection) => {
    setEditingConn(conn);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (conn: SavedConnection) => {
    await deleteConnection(conn.id);
  }, [deleteConnection]);

  const handleDuplicate = useCallback(async (conn: SavedConnection) => {
    await saveConnection({
      ...conn, id: crypto.randomUUID(), name: `${conn.name} (Copy)`, config: { ...conn.config },
    });
  }, [saveConnection]);

  const handleNewGroup = useCallback(async () => {
    const id = crypto.randomUUID();
    await saveGroup({ id, name: "New Group", color: "#6366f1", order: groups.size, collapsed: false });
  }, [saveGroup, groups.size]);

  const handleExport = useCallback((conn: SavedConnection) => {
    setExportIds([conn.id]);
  }, []);

  const handleCopyImportLink = useCallback(async (conn: SavedConnection) => {
    try {
      const link = await buildImportLink(conn.id);
      await navigator.clipboard.writeText(link);
      toast.success("Import link copied");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }, []);

  // Filter connections by search query
  const connList = useMemo(() => Array.from(connections.values()), [connections]);
  const groupList = useMemo(
    () => Array.from(groups.values()).sort((a, b) => a.order - b.order),
    [groups],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTagFilter/activeGroupFilter trigger re-filter via store
  const filteredConns = useMemo(() => filterConnections(connList, search), [connList, search, activeTagFilter, activeGroupFilter]);

  const filteredConnIds = useMemo(() => new Set(filteredConns.map((c) => c.id)), [filteredConns]);
  const ungrouped = useMemo(() => filteredConns.filter((c) => !c.groupId), [filteredConns]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setTagFilter([]);
    setGroupFilter(null);
  }, [setTagFilter, setGroupFilter]);

  if (showForm) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto pt-12">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface-elevated shadow-sm">
          <ConnectionForm initial={editingConn} onClose={closeForm} />
        </div>
      </div>
  );
}

  const hasConnections = connList.length > 0 || groupList.length > 0;
  const isSearching = search.trim() !== "";
  const isFiltering = activeTagFilter.length > 0 || activeGroupFilter !== null;
  const hasSearchResults = (isSearching || isFiltering) ? filteredConns.length > 0 : hasConnections;

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto p-8">
      <div className="flex w-full max-w-[480px] flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1.5 pt-8">
          <img src={logoIcon} alt="TablePro" className="h-12 w-12" />
          <h1 className="text-lg font-semibold text-text-primary">TablePro</h1>
          <p className="text-sm text-text-secondary">Connect to a database to get started</p>
          <p className="text-xs text-text-muted">v{__APP_VERSION__}</p>
        </div>

        {hasConnections && (
          <div className="w-full">
            <ConnectionSearch value={search} onChange={setSearch} connections={connList} />
          </div>
        )}

        {error && (
          <p className="state-strip-danger w-full rounded-md px-3 py-2 text-xs">
            {error}
          </p>
        )}

        {hasConnections ? (
          hasSearchResults ? (
            <ConnectionList
              groupList={groupList}
              allConnections={connList}
              filteredConnIds={filteredConnIds}
              ungrouped={ungrouped}
              connectingId={connectingId}
              isSearching={isSearching}
              isFiltering={isFiltering}
              getStatus={getStatus}
              onConnect={handleConnect}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onDeleteGroup={deleteGroup}
              onClearFilters={clearAllFilters}
              onExport={handleExport}
              onCopyImportLink={handleCopyImportLink}
            />
          ) : (
            <div className="w-full py-8 text-center">
              <p className="text-sm text-text-secondary">
                {isSearching
                  ? <>No connections matching &quot;{search}&quot;</>
                  : "No connections match the active filters"}
              </p>
              <button onClick={clearAllFilters} className="mt-1 text-xs text-accent-blue hover:underline">
                Clear filters
              </button>
            </div>
          )
        ) : (
          <div className="w-full py-12">
            <EmptyState
              icon={<DatabaseIcon size={32} />}
              message="No saved connections"
              description="Click 'New Connection' to add your first database connection."
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => { setEditingConn(undefined); setShowForm(true); }}
            className="button-primary flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium"
          >
            <Plus size={14} />
            New Connection
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          >
            <Download size={12} />
            Import
          </button>
          <button
            onClick={() => void handleNewGroup()}
            className="text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            + New Group
          </button>
        </div>

        <div className="h-8" />
      </div>

      {exportIds && (
        <ConnectionExportDialog
          connections={connList}
          preSelectedIds={exportIds}
          onClose={() => setExportIds(null)}
        />
      )}

      {showImport && (
        <ConnectionImportDialog
          onClose={() => setShowImport(false)}
          onImported={() => void loadConnections()}
        />
      )}
    </div>
  );
}
