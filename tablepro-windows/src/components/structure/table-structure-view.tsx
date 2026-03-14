import { useState } from "react";
import { X, Table2 } from "lucide-react";
import { ColumnsTab } from "./columns-tab";
import { IndexesTab } from "./indexes-tab";
import { ForeignKeysTab } from "./foreign-keys-tab";
import { DdlTab } from "./ddl-tab";

type StructureTab = "columns" | "indexes" | "foreign-keys" | "ddl";

interface TableStructureViewProps {
  sessionId: string;
  tableName: string;
  schema?: string;
  onClose?: () => void;
}

export function TableStructureView({
  sessionId,
  tableName,
  schema,
  onClose,
}: TableStructureViewProps) {
  const [activeTab, setActiveTab] = useState<StructureTab>("columns");

  const tabs: { id: StructureTab; label: string }[] = [
    { id: "columns", label: "Columns" },
    { id: "indexes", label: "Indexes" },
    { id: "foreign-keys", label: "Foreign Keys" },
    { id: "ddl", label: "DDL" },
  ];

  const tabCls = (id: StructureTab) =>
    `px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors ${
      activeTab === id
        ? "border-blue-500 text-blue-600 dark:text-blue-400"
        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    }`;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <Table2 size={14} className="text-blue-500" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {schema ? `${schema}.${tableName}` : tableName}
        </span>
        <span className="text-xs text-zinc-400">— Structure</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tabCls(tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "columns" && (
          <ColumnsTab sessionId={sessionId} tableName={tableName} schema={schema} />
        )}
        {activeTab === "indexes" && (
          <IndexesTab sessionId={sessionId} tableName={tableName} schema={schema} />
        )}
        {activeTab === "foreign-keys" && (
          <ForeignKeysTab sessionId={sessionId} tableName={tableName} schema={schema} />
        )}
        {activeTab === "ddl" && (
          <DdlTab sessionId={sessionId} tableName={tableName} schema={schema} />
        )}
      </div>
    </div>
  );
}
