import { ExportDialog } from '../export/export-dialog';
import { ConfirmExecuteDialog } from './confirm-execute-dialog';
import { ConfirmRefreshDialog } from './confirm-refresh-dialog';
import { BulkInsertDialog } from './bulk-insert-dialog';
import { BulkUpdateDialog } from './bulk-update-dialog';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import type { SavePayload } from '../../ipc/commands';
import type { QueryResult } from '../../types/query';

export interface ResultPanelDialogsProps {
  sessionId?: string;
  activeConnectionId: string | null;
  tableName?: string;
  schema?: string | null;
  isTableMode: boolean;
  /** The unfiltered table/query result the bulk dialogs read columns from. */
  result: QueryResult | null;
  /** What Export writes out — the rows currently on screen. */
  displayResult: QueryResult | null;
  exportSql: string;
  isSaving: boolean;
  changeCount: number;

  showExport: boolean;
  onCloseExport: () => void;

  confirmExecuteOpen: boolean;
  confirmExecutePayload: SavePayload | null;
  onConfirmExecute: () => void;
  onCancelExecute: () => void;

  confirmRefreshOpen: boolean;
  onSaveAndRefresh: () => void;
  onDiscardAndRefresh: () => void;
  onCancelRefresh: () => void;

  bulkInsertOpen: boolean;
  bulkUpdateOpen: boolean;
  bulkDeleteOpen: boolean;
  onCloseBulkInsert: () => void;
  onCloseBulkUpdate: () => void;
  onCloseBulkDelete: () => void;
  onBulkSuccess: () => void;
}

/**
 * Every dialog the result panel can raise, in one place.
 *
 * The panel itself keeps the state and the handlers — only the render sites
 * move here, which is what kept `result-panel.tsx` near 600 lines.
 */
export function ResultPanelDialogs({
  sessionId,
  activeConnectionId,
  tableName,
  schema,
  isTableMode,
  result,
  displayResult,
  exportSql,
  isSaving,
  changeCount,
  showExport,
  onCloseExport,
  confirmExecuteOpen,
  confirmExecutePayload,
  onConfirmExecute,
  onCancelExecute,
  confirmRefreshOpen,
  onSaveAndRefresh,
  onDiscardAndRefresh,
  onCancelRefresh,
  bulkInsertOpen,
  bulkUpdateOpen,
  bulkDeleteOpen,
  onCloseBulkInsert,
  onCloseBulkUpdate,
  onCloseBulkDelete,
  onBulkSuccess,
}: ResultPanelDialogsProps) {
  return (
    <>
      {showExport && displayResult && (sessionId || activeConnectionId) && (
        <ExportDialog
          sessionId={(sessionId || activeConnectionId)!}
          sql={exportSql}
          result={displayResult}
          onClose={onCloseExport}
        />
      )}
      <ConfirmExecuteDialog
        open={confirmExecuteOpen}
        sessionId={sessionId}
        payload={confirmExecutePayload}
        isSaving={isSaving}
        onExecute={onConfirmExecute}
        onCancel={onCancelExecute}
      />
      <ConfirmRefreshDialog
        open={confirmRefreshOpen}
        changeCount={changeCount}
        onSaveAndRefresh={onSaveAndRefresh}
        onDiscardAndRefresh={onDiscardAndRefresh}
        onCancel={onCancelRefresh}
        isSaving={isSaving}
      />
      {isTableMode && sessionId && tableName && result && (
        <>
          <BulkInsertDialog
            open={bulkInsertOpen}
            sessionId={sessionId}
            table={tableName}
            schema={schema ?? null}
            columns={result.columns}
            onClose={onCloseBulkInsert}
            onSuccess={onBulkSuccess}
          />
          <BulkUpdateDialog
            open={bulkUpdateOpen}
            sessionId={sessionId}
            table={tableName}
            schema={schema ?? null}
            columns={result.columns}
            onClose={onCloseBulkUpdate}
            onSuccess={onBulkSuccess}
          />
          <BulkDeleteDialog
            open={bulkDeleteOpen}
            sessionId={sessionId}
            table={tableName}
            schema={schema ?? null}
            columns={result.columns}
            onClose={onCloseBulkDelete}
            onSuccess={onBulkSuccess}
          />
        </>
      )}
    </>
  );
}
