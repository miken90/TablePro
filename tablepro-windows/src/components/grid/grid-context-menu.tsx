import React from 'react';

interface GridContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyAsInsert: () => void;
  onCopyAsUpdate: () => void;
  onCopyRowTsv: () => void;
  onCopyCell: () => void;
}

function Item({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700"
    >
      {label}
    </button>
  );
}

export function GridContextMenu({
  x,
  y,
  onClose,
  onCopyAsInsert,
  onCopyAsUpdate,
  onCopyRowTsv,
  onCopyCell,
}: GridContextMenuProps) {
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
        <Item label="Copy as INSERT" onClick={onCopyAsInsert} />
        <Item label="Copy as UPDATE" onClick={onCopyAsUpdate} />
        <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
        <Item label="Copy Row (Tab-separated)" onClick={onCopyRowTsv} />
        <Item label="Copy Cell" onClick={onCopyCell} />
      </div>
    </>
  );
}
