import { useState, useEffect, useCallback } from "react";
import { SQLEditor } from "../editor/SQLEditor";
import { useAppStore } from "../../stores/app";
import { fetchColumns, fetchIndexes, fetchForeignKeys, fetchTableDdl } from "../../utils/api";
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from "../../types";

type StructureTab = "columns" | "indexes" | "foreign_keys" | "ddl";

interface StructureViewProps {
  tableName: string;
}

export function StructureView({ tableName }: StructureViewProps) {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const [activeTab, setActiveTab] = useState<StructureTab>("columns");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [ddl, setDdl] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeConnectionId) return;
    setLoading(true);
    try {
      const [cols, idxs, fks, ddlText] = await Promise.all([
        fetchColumns(activeConnectionId, tableName),
        fetchIndexes(activeConnectionId, tableName),
        fetchForeignKeys(activeConnectionId, tableName),
        fetchTableDdl(activeConnectionId, tableName),
      ]);
      setColumns(cols);
      setIndexes(idxs);
      setForeignKeys(fks);
      setDdl(ddlText);
    } catch {
      // Error loading structure
    } finally {
      setLoading(false);
    }
  }, [activeConnectionId, tableName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: { id: StructureTab; label: string; count?: number }[] = [
    { id: "columns", label: "Columns", count: columns.length },
    { id: "indexes", label: "Indexes", count: indexes.length },
    { id: "foreign_keys", label: "Foreign Keys", count: foreignKeys.length },
    { id: "ddl", label: "DDL" },
  ];

  const thClass = "px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700";
  const tdClass = "px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800";

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-500 dark:text-blue-400"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-zinc-500">Loading…</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {activeTab === "columns" && (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Nullable</th>
                  <th className={thClass}>Default</th>
                  <th className={thClass}>Key</th>
                  <th className={thClass}>Extra</th>
                  <th className={thClass}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <tr key={col.name} className="hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <td className={`${tdClass} font-medium`}>
                      {col.is_primary_key && (
                        <span className="mr-1.5 text-yellow-500">🔑</span>
                      )}
                      {col.name}
                    </td>
                    <td className={`${tdClass} font-mono text-blue-400`}>{col.data_type}</td>
                    <td className={tdClass}>
                      {col.is_nullable ? (
                        <span className="text-zinc-500">YES</span>
                      ) : (
                        <span className="text-orange-400">NO</span>
                      )}
                    </td>
                    <td className={`${tdClass} font-mono`}>
                      {col.default_value ?? (
                        <span className="italic text-zinc-600">NULL</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {col.is_primary_key && (
                        <span className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-yellow-400">
                          PRI
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} text-zinc-500`}>{col.extra}</td>
                    <td className={`${tdClass} text-zinc-500`}>{col.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "indexes" && (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Columns</th>
                  <th className={thClass}>Unique</th>
                  <th className={thClass}>Type</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx) => (
                  <tr key={idx.name} className="hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <td className={`${tdClass} font-medium`}>
                      {idx.is_primary && (
                        <span className="mr-1.5 text-yellow-500">🔑</span>
                      )}
                      {idx.name}
                    </td>
                    <td className={`${tdClass} font-mono text-blue-400`}>
                      {idx.columns.join(", ")}
                    </td>
                    <td className={tdClass}>
                      {idx.is_unique ? (
                        <span className="text-green-400">YES</span>
                      ) : (
                        <span className="text-zinc-500">NO</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-zinc-500`}>{idx.index_type}</td>
                  </tr>
                ))}
                {indexes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-zinc-500">
                      No indexes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "foreign_keys" && (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Column</th>
                  <th className={thClass}>Referenced Table</th>
                  <th className={thClass}>Referenced Column</th>
                  <th className={thClass}>On Delete</th>
                  <th className={thClass}>On Update</th>
                </tr>
              </thead>
              <tbody>
                {foreignKeys.map((fk) => (
                  <tr key={fk.name} className="hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <td className={`${tdClass} font-medium`}>{fk.name}</td>
                    <td className={`${tdClass} font-mono text-blue-400`}>{fk.column}</td>
                    <td className={`${tdClass} font-mono text-purple-400`}>
                      {fk.referenced_table}
                    </td>
                    <td className={`${tdClass} font-mono text-purple-400`}>
                      {fk.referenced_column}
                    </td>
                    <td className={`${tdClass} text-zinc-500`}>{fk.on_delete}</td>
                    <td className={`${tdClass} text-zinc-500`}>{fk.on_update}</td>
                  </tr>
                ))}
                {foreignKeys.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-xs text-zinc-500">
                      No foreign keys
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "ddl" && (
            <div className="h-full">
              <SQLEditor
                value={ddl}
                onChange={() => {}}
                onExecute={() => {}}
                readOnly
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
