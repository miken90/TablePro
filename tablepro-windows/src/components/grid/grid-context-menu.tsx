import React from 'react';
import { useTranslation } from 'react-i18next';

interface GridContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyAsInsert: () => void;
  onCopyAsUpdate: () => void;
  onCopyRowTsv: () => void;
  onCopyCell: () => void;
  onCopyAsJson?: () => void;
  isTableMode?: boolean;
  onEditValue?: () => void;
  onSetNull?: () => void;
  onDuplicateRow?: () => void;
  onDeleteRow?: () => void;
  isDeletedRow?: boolean;
  isPkColumn?: boolean;
  selectionMode?: 'cell' | 'range' | 'row' | 'column' | null;
  onCopySelection?: () => void;
  onBulkInsert?: () => void;
  onBulkUpdate?: () => void;
  onBulkDelete?: () => void;
  /** Number of selected rows (for label display). */
  selectedRowCount?: number;
}

function Item({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 text-xs ${
        disabled
          ? 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'
      }`}
    >
      {label}
    </button>
  );
}

function Separator() {
  return <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />;
}

export function GridContextMenu({
  x, y, onClose,
  onCopyAsInsert, onCopyAsUpdate, onCopyRowTsv, onCopyCell, onCopyAsJson,
  isTableMode, onEditValue, onSetNull, onDuplicateRow, onDeleteRow,
  isDeletedRow, isPkColumn, selectionMode, onCopySelection,
  onBulkInsert, onBulkUpdate, onBulkDelete, selectedRowCount,
}: GridContextMenuProps) {
  const { t } = useTranslation();
  return (
    <>
      <button
        type="button"
        aria-label="Close context menu"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        className="fixed z-50 min-w-[180px] rounded border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        style={{ left: x, top: y }}
      >
        <Item label="Copy Cell" onClick={onCopyCell} />
        {onCopySelection && selectionMode && selectionMode !== 'cell' && (
          <Item label="Copy Selection" onClick={onCopySelection} />
        )}
        <Item label="Copy Row (Tab-separated)" onClick={onCopyRowTsv} />
        {onCopyAsJson && <Item label="Copy Row (JSON)" onClick={onCopyAsJson} />}
        <Item label="Copy as INSERT" onClick={onCopyAsInsert} />
        {isTableMode && <Item label="Copy as UPDATE" onClick={onCopyAsUpdate} />}

        {isTableMode && (
          <>
            <Separator />
            {onEditValue && (
              <Item label="Edit Value" onClick={onEditValue} disabled={isDeletedRow} />
            )}
            {onSetNull && (
              <Item label="Set NULL" onClick={onSetNull} disabled={isDeletedRow || isPkColumn} />
            )}
            <Separator />
            {onDuplicateRow && (
              <Item label="Duplicate Row" onClick={onDuplicateRow} disabled={isDeletedRow} />
            )}
            {onDeleteRow && (
              <Item label={(selectedRowCount ?? 0) > 1 ? `Delete ${selectedRowCount} Rows` : 'Delete Row'} onClick={onDeleteRow} />
            )}
            {(onBulkInsert || onBulkUpdate || onBulkDelete) && (
              <>
                <Separator />
                {onBulkInsert && (
                  <Item label={t('grid.bulk.insertRows')} onClick={onBulkInsert} />
                )}
                {onBulkUpdate && (
                  <Item label={t('grid.bulk.updateColumn')} onClick={onBulkUpdate} />
                )}
                {onBulkDelete && (
                  <Item label={t('grid.bulk.deleteRows')} onClick={onBulkDelete} />
                )}
              </>
            )}
          </>
        )}

        {!isTableMode && (
          <>
            <Separator />
            <Item label="Copy as UPDATE" onClick={onCopyAsUpdate} />
          </>
        )}
      </div>
    </>
  );
}
