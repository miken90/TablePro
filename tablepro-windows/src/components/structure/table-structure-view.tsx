import { useState, useCallback } from "react";
import { X, Table2, Eye } from "lucide-react";
import { ColumnsTab } from "./columns-tab";
import { IndexesTab } from "./indexes-tab";
import { ForeignKeysTab } from "./foreign-keys-tab";
import { DdlTab } from "./ddl-tab";
import { SchemaPreviewDialog } from "./schema-preview-dialog";
import { useStructureChangeStore } from "../../stores/structureChangeStore";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { AlterColumnChange } from "../../ipc/commands";

type StructureTab = "columns" | "indexes" | "foreign-keys" | "ddl";

interface TableStructureViewProps {
  sessionId: string;
  tableName: string;
  schema?: string;
  onClose?: () => void;
  onRefresh?: () => void;
}

export function TableStructureView({
  sessionId,
  tableName,
  schema,
  onClose,
  onRefresh,
}: TableStructureViewProps) {
  const [activeTab, setActiveTab] = useState<StructureTab>("columns");
  const [showPreview, setShowPreview] = useState(false);
  const [previewSql, setPreviewSql] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const { changes, discardAll } = useStructureChangeStore();

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

  const buildAlterPayload = useCallback((): AlterColumnChange[] => {
    return changes.map(c => ({
      changeType: c.type,
      columnName: c.columnName,
      before: c.before ? {
        name: c.before.name,
        typeName: c.before.typeName,
        nullable: c.before.nullable,
        defaultValue: c.before.defaultValue,
        isPrimaryKey: c.before.isPrimaryKey,
        position: c.before.position,
      } : undefined,
      after: c.after ? {
        name: c.after.name,
        typeName: c.after.typeName,
        nullable: c.after.nullable,
        defaultValue: c.after.defaultValue,
        isPrimaryKey: c.after.isPrimaryKey,
        position: c.after.position,
      } : undefined,
    }));
  }, [changes]);

  const handlePreview = useCallback(async () => {
    setApplyError(null);
    try {
      const sql = await commands.generateAlterSql(sessionId, {
        table: tableName,
        schema: schema ?? null,
        changes: buildAlterPayload(),
      });
      setPreviewSql(sql);
      setShowPreview(true);
    } catch (err) {
      setApplyError(extractErrorMessage(err));
    }
  }, [sessionId, tableName, schema, buildAlterPayload]);

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setApplyError(null);
    try {
      await commands.applyAlter(sessionId, {
        table: tableName,
        schema: schema ?? null,
        changes: buildAlterPayload(),
      });
      discardAll();
      setShowPreview(false);
      onRefresh?.();
    } catch (err) {
      setApplyError(extractErrorMessage(err));
    } finally {
      setIsApplying(false);
    }
  }, [sessionId, tableName, schema, buildAlterPayload, discardAll, onRefresh]);

  const hasChanges = changes.length > 0;

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

      {/* Pending changes bar */}
      {hasChanges && activeTab === "columns" && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 text-xs">
          <span className="flex-1 text-amber-800 dark:text-amber-300">
            ⚠ {changes.length} pending schema {changes.length === 1 ? "change" : "changes"}
          </span>
          <button
            type="button"
            onClick={discardAll}
            className="border border-red-400 text-red-600 hover:bg-red-50 px-2 py-0.5 rounded text-xs"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handlePreview}
            className="flex items-center gap-1 bg-blue-600 text-white hover:bg-blue-700 px-2 py-0.5 rounded text-xs"
          >
            <Eye size={11} />
            Preview & Apply
          </button>
        </div>
      )}

      {/* Error bar */}
      {applyError && !showPreview && (
        <div className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700">
          {applyError}
        </div>
      )}

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

      {/* Schema preview dialog */}
      {showPreview && (
        <SchemaPreviewDialog
          sql={previewSql}
          tableName={tableName}
          isApplying={isApplying}
          applyError={applyError}
          onApply={handleApply}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
