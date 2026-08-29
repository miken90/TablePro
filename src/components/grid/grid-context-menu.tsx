import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, MenuItem, MenuDivider } from '../ui';

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

export function GridContextMenu({
  x, y, onClose,
  onCopyAsInsert, onCopyAsUpdate, onCopyRowTsv, onCopyCell, onCopyAsJson,
  isTableMode, onEditValue, onSetNull, onDuplicateRow, onDeleteRow,
  isDeletedRow, isPkColumn, selectionMode, onCopySelection,
  onBulkInsert, onBulkUpdate, onBulkDelete, selectedRowCount,
}: GridContextMenuProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  // A context menu closes on a click anywhere else; the kit Menu only owns Esc.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div ref={rootRef} style={{ position: 'fixed', top: y, left: x }} className="z-popover" onContextMenu={(e) => e.preventDefault()}>
      <Menu open onClose={onClose}>
        <MenuItem onSelect={run(onCopyCell)}>Copy Cell</MenuItem>
        {onCopySelection && selectionMode && selectionMode !== 'cell' && (
          <MenuItem onSelect={run(onCopySelection)}>Copy Selection</MenuItem>
        )}
        <MenuItem onSelect={run(onCopyRowTsv)}>Copy Row (Tab-separated)</MenuItem>
        {onCopyAsJson && <MenuItem onSelect={run(onCopyAsJson)}>Copy Row (JSON)</MenuItem>}
        <MenuItem onSelect={run(onCopyAsInsert)}>Copy as INSERT</MenuItem>
        {isTableMode && <MenuItem onSelect={run(onCopyAsUpdate)}>Copy as UPDATE</MenuItem>}

        {isTableMode && (
          <>
            <MenuDivider />
            {onEditValue && (
              <MenuItem onSelect={run(onEditValue)} disabled={isDeletedRow}>Edit Value</MenuItem>
            )}
            {onSetNull && (
              <MenuItem onSelect={run(onSetNull)} disabled={isDeletedRow || isPkColumn}>Set NULL</MenuItem>
            )}
            <MenuDivider />
            {onDuplicateRow && (
              <MenuItem onSelect={run(onDuplicateRow)} disabled={isDeletedRow}>Duplicate Row</MenuItem>
            )}
            {onDeleteRow && (
              <MenuItem onSelect={run(onDeleteRow)} danger>
                {(selectedRowCount ?? 0) > 1 ? `Delete ${selectedRowCount} Rows` : 'Delete Row'}
              </MenuItem>
            )}
            {(onBulkInsert || onBulkUpdate || onBulkDelete) && (
              <>
                <MenuDivider />
                {onBulkInsert && (
                  <MenuItem onSelect={run(onBulkInsert)}>{t('grid.bulk.insertRows')}</MenuItem>
                )}
                {onBulkUpdate && (
                  <MenuItem onSelect={run(onBulkUpdate)}>{t('grid.bulk.updateColumn')}</MenuItem>
                )}
                {onBulkDelete && (
                  <MenuItem onSelect={run(onBulkDelete)} danger>{t('grid.bulk.deleteRows')}</MenuItem>
                )}
              </>
            )}
          </>
        )}

        {!isTableMode && (
          <>
            <MenuDivider />
            <MenuItem onSelect={run(onCopyAsUpdate)}>Copy as UPDATE</MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}
