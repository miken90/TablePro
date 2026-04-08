import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
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

interface ProgressPayload {
  batch: number;
  totalBatches: number;
  rowsAffected: number;
}

export function BulkInsertDialog({
  open, sessionId, table, schema, columns, onClose, onSuccess,
}: BulkInsertDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [skipHeader, setSkipHeader] = useState(false);
  const [columnMapping, setColumnMapping] = useState<string[]>([]);
  const [isInserting, setIsInserting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive effective rows (skip header if toggled)
  const effectiveRows = useMemo(
    () => (skipHeader && parsedRows.length > 0 ? parsedRows.slice(1) : parsedRows),
    [parsedRows, skipHeader],
  );

  // Initialize column mapping when parsed rows change
  useEffect(() => {
    if (parsedRows.length > 0) {
      const colCount = parsedRows[0].length;
      setColumnMapping(
        Array.from({ length: colCount }, (_, i) => columns[i]?.name ?? ''),
      );
    } else {
      setColumnMapping([]);
    }
  }, [parsedRows, columns]);

  const selectedColumns = useMemo(
    () => columnMapping.filter((c) => c.length > 0),
    [columnMapping],
  );

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

  const updateColumnMapping = useCallback((index: number, value: string) => {
    setColumnMapping((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const previewRows = useMemo(
    () => effectiveRows.slice(0, MAX_PREVIEW_ROWS),
    [effectiveRows],
  );

  const handleInsert = useCallback(async () => {
    if (effectiveRows.length === 0 || selectedColumns.length === 0) return;

    setIsInserting(true);
    setProgress(null);

    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<ProgressPayload>('bulk:progress', (event) => {
        setProgress(event.payload);
      });

      // Map each parsed row to column mapping, converting empty strings to null
      const activeIndices = columnMapping
        .map((col, idx) => (col ? idx : -1))
        .filter((idx) => idx >= 0);

      const mappedRows = effectiveRows.map((row) =>
        activeIndices.map((idx) => {
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
      unlisten?.();
      setIsInserting(false);
      setProgress(null);
    }
  }, [effectiveRows, selectedColumns, columnMapping, sessionId, table, schema, t, toast, onSuccess, onClose]);

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

          {/* Skip header toggle */}
          {parsedRows.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={skipHeader}
                onChange={(e) => setSkipHeader(e.target.checked)}
                className="w-3 h-3"
              />
              {t('grid.bulk.skipHeader')}
            </label>
          )}

          {/* Column mapping */}
          {columnMapping.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                {t('grid.bulk.mapColumns')}
              </div>
              <div className="flex flex-wrap gap-2">
                {columnMapping.map((mapped, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="text-xs text-zinc-400 w-5 text-right">{idx + 1}→</span>
                    <select
                      value={mapped}
                      onChange={(e) => updateColumnMapping(idx, e.target.value)}
                      className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    >
                      <option value="">—</option>
                      {columns.map((col) => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t('grid.bulk.previewRows', { count: Math.min(effectiveRows.length, MAX_PREVIEW_ROWS) })}
                </span>
                <span className="text-xs text-zinc-500">
                  {t('grid.bulk.totalRows', { count: effectiveRows.length })}
                </span>
              </div>
              <div className="max-h-48 overflow-auto rounded border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                    <tr>
                      {columnMapping.map((col, idx) =>
                        col ? (
                          <th key={idx} className="px-2 py-1 text-left font-medium text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                            {col}
                          </th>
                        ) : null,
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-zinc-100 dark:border-zinc-800">
                        {columnMapping.map((col, ci) =>
                          col ? (
                            <td key={ci} className="px-2 py-1 text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">
                              {row[ci] ?? ''}
                            </td>
                          ) : null,
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {isInserting && progress && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {t('grid.bulk.progress', { batch: progress.batch, total: progress.totalBatches, rows: progress.rowsAffected })}
              </div>
              <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(progress.batch / progress.totalBatches) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-200 dark:border-zinc-700">
          <span className="text-xs text-zinc-500">
            {effectiveRows.length === 0 ? t('grid.bulk.noData') : t('grid.bulk.totalRows', { count: effectiveRows.length })}
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
              disabled={isInserting || effectiveRows.length === 0 || selectedColumns.length === 0}
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
