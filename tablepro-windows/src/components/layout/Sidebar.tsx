import { useEffect, useState } from "react";
import { useSidebarStore } from "../../stores/sidebar";
import { useAppStore } from "../../stores/app";
import type { SidebarNode } from "../../types";
import { ChevronRight, ChevronDown, Table, Eye, Database } from "lucide-react";

interface SidebarProps {
  onTableSelect: (tableName: string) => void;
}

function NodeIcon({ nodeType }: { nodeType: SidebarNode["nodeType"] }) {
  switch (nodeType) {
    case "table":
      return <Table size={14} className="shrink-0 text-blue-400" />;
    case "view":
      return <Eye size={14} className="shrink-0 text-purple-400" />;
    default:
      return <Database size={14} className="shrink-0 text-yellow-400" />;
  }
}

function TreeNode({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  node: SidebarNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelect: (node: SidebarNode) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm transition ${
          selected ? "bg-blue-600/20 text-blue-600 dark:text-blue-300" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelect(node);
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <NodeIcon nodeType={node.nodeType} />
        <span className="truncate">{node.name}</span>
        {node.rowCount != null && (
          <span className="ml-auto text-xs text-zinc-500">{node.rowCount.toLocaleString()}</span>
        )}
      </div>
      {hasChildren && expanded && node.children!.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          selected={selected && child.id === node.id}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function Sidebar({ onTableSelect }: SidebarProps) {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const nodes = useSidebarStore((s) => s.nodes);
  const expandedIds = useSidebarStore((s) => s.expandedIds);
  const selectedId = useSidebarStore((s) => s.selectedId);
  const databases = useSidebarStore((s) => s.databases);
  const activeDatabase = useSidebarStore((s) => s.activeDatabase);
  const loading = useSidebarStore((s) => s.loading);
  const loadDatabases = useSidebarStore((s) => s.loadDatabases);
  const loadTables = useSidebarStore((s) => s.loadTables);
  const setActiveDatabase = useSidebarStore((s) => s.setActiveDatabase);
  const toggleExpanded = useSidebarStore((s) => s.toggleExpanded);
  const setSelectedId = useSidebarStore((s) => s.setSelectedId);
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: SidebarNode } | null>(null);

  useEffect(() => {
    if (activeConnectionId) {
      loadDatabases(activeConnectionId);
      loadTables(activeConnectionId);
    }
  }, [activeConnectionId, loadDatabases, loadTables]);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const handleSelect = (node: SidebarNode) => {
    setSelectedId(node.id);
    if (node.nodeType === "table" || node.nodeType === "view") {
      onTableSelect(node.name);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: SidebarNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const filteredNodes = search
    ? nodes.map((section) => ({
        ...section,
        children: section.children?.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()),
        ),
      })).filter((s) => s.children && s.children.length > 0)
    : nodes;

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Database switcher */}
      {databases.length > 1 && (
        <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <select
            value={activeDatabase ?? ""}
            onChange={(e) => {
              setActiveDatabase(e.target.value);
              if (activeConnectionId) loadTables(activeConnectionId);
            }}
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search */}
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <input
          type="text"
          placeholder="Filter tables…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-zinc-500">Loading…</span>
          </div>
        ) : (
          filteredNodes.map((node) => (
            <div
              key={node.id}
              onContextMenu={(e) => {
                if (node.nodeType === "table" || node.nodeType === "view") {
                  handleContextMenu(e, node);
                }
              }}
            >
              <TreeNode
                node={node}
                depth={0}
                expanded={expandedIds.has(node.id)}
                selected={selectedId === node.id}
                onToggle={toggleExpanded}
                onSelect={handleSelect}
              />
            </div>
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onTableSelect(contextMenu.node.name);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Open
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.node.name);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Copy Name
          </button>
        </div>
      )}
    </div>
  );
}
