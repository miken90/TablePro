import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X } from 'lucide-react';
import { bulkInsert } from '../../ipc/commands';
import { useToast } from '../../hooks/useToast';
import type { ColumnInfo } from '../../types/query';

interface BulkInsertDialogProps {
  open: boolean;
  sessionId: string;
  table: string;
  schema: string | null;
  columns: ColumnInfo[];
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_PREVIEW_ROWS = 100;

/** Parse a TSV/CSV string into rows of string arrays. */
function parseTsv(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(field);
      field = '';
    } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      if (ch === '\r') i++;
      current.push(field);
      field = '';
      if (current.some((c) => c.length > 0)) rows.push(current);
      current = [];
    } else {
      field += ch;
    }
  }
  current.push(field);
  if (current.some((c) => c.length > 0)) rows.push(current);
  return rows;
}

export function BulkInsertDialog({
  open, sessionId, table, schema, columns, onClose, onSuccess,
}: BulkInsertDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() =>
    columns.map((c) => c.name),
  );
  const [isInserting, setIsInserting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = useCallback((text: string) => {
    setRawText(text);
    setParsedRows(parseTsv(text));
  }, []);

  const handleFileDrop = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t('grid.bulk.fileTooLarge'));
        return;
      }
      const text = await file.text();
      const rows = file.name.endsWith('.csv') ? parseCsv(text) : parseTsv(text);
      setRawText(text);
      setParsedRows(rows);
    },
    [t, toast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileDrop(file);
    },
    [handleFileDrop],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileDrop(file);
    },
    [handleFileDrop],
  );

  const toggleColumn = useCallback(
    (colName: string) => {
      setSelectedColumns((prev) =>
        prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName],
      );
    },
    [],
  );

  const previewRows = useMemo(
    () => parsedRows.slice(0, MAX_PREVIEW_ROWS),
    [parsedRows],
  );

  const handleInsert = useCallback(async () => {
    if (parsedRows.length === 0 || selectedColumns.length === 0) return;

    setIsInserting(true);
    try {
      // Map each parsed row to selected columns, converting empty strings to null
      const mappedRows = parsedRows.map((row) =>
        selectedColumns.map((_, idx) => {
          const val = row[idx];
          return val === undefined || val === '' ? null : val;
        }),
      );

      const result = await bulkInsert(sessionId, table, schema, selectedColumns, mappedRows);
      toast.success(
        t('grid.bulk.insertSuccess', { count: result.rowsAffected, ms: result.durationMs }),
      );
      onSuccess();
      onClose();
    } catch (err) {
      toast.showError(t('grid.bulk.insertFailed'), err);
    } finally {
      setIsInserting(false);
    }
  }, [parsedRows, selectedColumns, sessionId, table, schema, t, toast, onSuccess, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[700px] max-w-[90vw] max-h-[85vh] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t('grid.bulk.insertTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {table}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
            <X size={16} className="text-zinc-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3">
          {/* Paste / Drop area */}
          <div
            className={`relative rounded-md border-2 border-dashed p-3 transition-colors ${
              dragOver
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'border-zinc-300 dark:border-zinc-600'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <textarea
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={t('grid.bulk.pasteOrDrop')}
              className="w-full h-24 resize-none bg-transparent text-xs font-mono text-zinc-700 dark:text-zinc-300 outline-none placeholder:text-zinc-400"
            />
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              >
                <Upload size={12} />
                {t('grid.bulk.dropCsv')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          </div>

          {/* Column selection */}
          <div>
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              {t('grid.bulk.columns')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col) => (
                <label
                  key={col.name}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col.name)}
                    onChange={() => toggleColumn(col.name)}
                    className="w-3 h-3"
                  />
                  <span className="text-zinc-700 dark:text-zinc-300">{col.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t('grid.bulk.previewRows', { count: Math.min(parsedRows.length, MAX_PREVIEW_ROWS) })}
                </span>
                <span className="text-xs text-zinc-500">
                  {t('grid.bulk.totalRows', { count: parsedRows.length })}
                </span>
              </div>
              <div className="max-h-48 overflow-auto rounded border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                    <tr>
                      {selectedColumns.map((col) => (
                        <th key={col} className="px-2 py-1 text-left font-medium text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-zinc-100 dark:border-zinc-800">
                        {selectedColumns.map((_, ci) => (
                          <td key={ci} className="px-2 py-1 text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">
                            {row[ci] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-200 dark:border-zinc-700">
          <span className="text-xs text-zinc-500">
            {parsedRows.length === 0 ? t('grid.bulk.noData') : t('grid.bulk.totalRows', { count: parsedRows.length })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              {t('grid.bulk.cancel')}
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={isInserting || parsedRows.length === 0 || selectedColumns.length === 0}
              className="px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInserting ? t('grid.bulk.inserting') : t('grid.bulk.insert')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
