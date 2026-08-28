import { useState, useCallback, useEffect } from "react";
import { Table2, Eye } from "lucide-react";
import { ColumnsTab } from "./columns-tab";
import { IndexesTab } from "./indexes-tab";
import { ForeignKeysTab } from "./foreign-keys-tab";
import { DdlTab } from "./ddl-tab";
import { SchemaPreviewDialog } from "./schema-preview-dialog";
import { makeStructureKey, useStructureChangeStore } from "../../stores/structureChangeStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { Button, IconButton, TabStrip } from "../ui";
import { X } from "lucide-react";
import * as commands from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { AlterColumnChange } from "../../ipc/commands";

type StructureTab = "columns" | "indexes" | "foreign-keys" | "ddl";

/** Stable empty list so an untouched table does not re-render on every store update. */
const NO_CHANGES: never[] = [];

const TABS: { id: StructureTab; label: string }[] = [
  { id: "columns", label: "Columns" },
  { id: "indexes", label: "Indexes" },
  { id: "foreign-keys", label: "Foreign Keys" },
  { id: "ddl", label: "DDL" },
];

interface TableStructureViewProps {
  sessionId: string;
  /** Owner of the staged-DDL bucket; falls back to the selected connection. */
  connectionId?: string;
  tableName: string;
  schema?: string;
  /** Only the legacy takeover host passed this; a structure tab closes via the tab bar. */
  onClose?: () => void;
  onRefresh?: () => void;
}

/**
 * SCR-28 — a table's structure as a tab body (M1). Only the active sub-tab
 * mounts, so each sub-tab fetches on first view and switching back does not
 * refetch what an inactive sibling never loaded.
 */
export function TableStructureView({
  sessionId,
  connectionId,
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

  // Staged DDL is kept per table; pointing the store here never discards.
  // The list is read by key so the first frame of a second structure tab
  // never shows the previous table's pending changes.
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const structureKey = makeStructureKey(connectionId ?? selectedConnectionId ?? sessionId, schema, tableName);
  useEffect(() => {
    useStructureChangeStore.getState().setActiveTable(structureKey);
  }, [structureKey]);
  const changes = useStructureChangeStore((s) => s._byTable[structureKey] ?? NO_CHANGES);
  const discardAll = useStructureChangeStore((s) => s.discardAll);

  const buildAlterPayload = useCallback((): AlterColumnChange[] => {
    return changes.map(c => ({
      changeType: c.type,
      columnName: c.columnName,
      before: c.before ? { ...c.before } : undefined,
      after: c.after ? { ...c.after } : undefined,
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
    <div className="flex h-full flex-col bg-surface-base">
      <div className="flex items-center gap-sm border-b border-border-subtle px-lg py-xs">
        <Table2 size={14} aria-hidden="true" className="text-accent-blue" />
        <h1 className="text-ui-md font-medium text-text-primary">
          {schema ? `${schema}.${tableName}` : tableName}
        </h1>
        <span className="text-ui-xs text-text-secondary">— Structure</span>
        {onClose && (
          <IconButton
            aria-label="Close structure view"
            icon={<X size={14} aria-hidden="true" />}
            onClick={onClose}
            className="ml-auto"
          />
        )}
      </div>

      <TabStrip
        height="sm"
        aria-label="Structure sections"
        tabs={TABS}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as StructureTab)}
        className="border-b border-border-subtle bg-surface"
      />

      {hasChanges && activeTab === "columns" && (
        <div className="state-strip-warning flex items-center gap-sm border-b px-lg py-xs text-ui-xs">
          <span className="flex-1">
            {changes.length} pending schema {changes.length === 1 ? "change" : "changes"}
          </span>
          <Button variant="danger-ghost" size="sm" onClick={discardAll}>
            Discard
          </Button>
          <Button variant="primary" size="sm" onClick={handlePreview}>
            <Eye size={11} aria-hidden="true" />
            Preview & Apply
          </Button>
        </div>
      )}

      {applyError && !showPreview && (
        <div role="alert" className="state-strip-danger border-b px-lg py-xs text-ui-xs">
          {applyError}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {activeTab === "columns" && (
          <ColumnsTab sessionId={sessionId} tableName={tableName} schema={schema} structureKey={structureKey} />
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
