import React, { useCallback, useMemo, useState } from 'react';
import { save as dialogSave } from '@tauri-apps/plugin-dialog';
import { Download, X } from 'lucide-react';
import type { ExportOptions } from '../../ipc/commands';
import { exportToFile } from '../../ipc/commands';
import { extractErrorMessage } from '../../ipc/error';
import { ExportProgress } from './export-progress';
import type { QueryResult } from '../../types/query';

type ExportFormat = 'csv' | 'json' | 'sql';

interface ExportDialogProps {
  sessionId: string;
  sql: string;
  result: QueryResult;
  onClose: () => void;
}

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  sql: 'sql',
};

const FORMAT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }[]> = {
  csv: [{ name: 'CSV files', extensions: ['csv'] }],
  json: [{ name: 'JSON files', extensions: ['json'] }],
  sql: [{ name: 'SQL files', extensions: ['sql'] }],
};

function PreviewRows({
  result,
  format,
  options,
}: {
  result: QueryResult;
  format: ExportFormat;
  options: ExportOptions;
}) {
  const previewText = useMemo(() => {
    const cols = result.columns;
    const rows = result.rows.slice(0, 5);
    const delim = options.delimiter ?? ',';
    const tableName = options.tableName ?? 'export';

    if (format === 'csv') {
      const lines: string[] = [];
      if (options.includeHeader !== false) {
        lines.push(cols.map((c) => c.name).join(delim));
      }
      for (const row of rows) {
        lines.push(row.map((v) => (v === null ? '' : v)).join(delim));
      }
      return lines.join('\n');
    }

    if (format === 'json') {
      const data = rows.map((row) => {
        if (options.arrayOfArrays) return row.map((v) => (v === null ? null : v));
        const obj: Record<string, string | null> = {};
        cols.forEach((c, i) => { obj[c.name] = row[i] ?? null; });
        return obj;
      });
      return options.pretty
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
    }

    if (format === 'sql') {
      const colList = cols.map((c) => `"${c.name}"`).join(', ');
      const lines: string[] = [];
      for (const row of rows) {
        const vals = row.map((v) =>
          v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
        );
        lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${vals.join(', ')});`);
      }
      return lines.join('\n');
    }

    return '';
  }, [result, format, options]);

  return (
    <pre className="h-32 overflow-auto rounded border border-zinc-200 bg-zinc-900 p-2 text-[10px] leading-relaxed text-green-400 dark:border-zinc-700">
      {previewText || '(no data)'}
    </pre>
  );
}

export function ExportDialog({ sessionId, sql, result, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [options, setOptions] = useState<ExportOptions>({
    delimiter: ',',
    includeHeader: true,
    pretty: false,
    arrayOfArrays: false,
    tableName: 'export',
    includeCreateTable: false,
    batchSize: 100,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
      setOptions((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const handleExport = useCallback(async () => {
    setError(null);
    try {
      // Use Tauri dialog plugin for native save dialog
      let filePath: string | null = null;
      try {
        filePath = await dialogSave({
          defaultPath: `export.${FORMAT_EXTENSIONS[format]}`,
          filters: FORMAT_FILTERS[format],
        });
      } catch {
        filePath = prompt('Enter file path to save:', `C:\\export.${FORMAT_EXTENSIONS[format]}`);
      }

      if (!filePath) return;

      setIsExporting(true);
      await exportToFile(sessionId, sql, format, filePath, options);
    } catch (e) {
      setError(extractErrorMessage(e));
      setIsExporting(false);
    }
  }, [sessionId, sql, format, options]);

  const handleExportComplete = useCallback(() => {
    setIsExporting(false);
    onClose();
  }, [onClose]);

  const fmtBtn = (f: ExportFormat) =>
    `px-3 py-1 text-xs rounded border transition-colors ${
      format === f
        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
        : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[480px] rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Download size={14} className="text-zinc-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Export Results</span>
          </div>
          <button onClick={onClose} className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Format selector */}
          <div>
            <label className="mb-1.5 block text-xs text-zinc-500 dark:text-zinc-400">Format</label>
            <div className="flex gap-2">
              <button className={fmtBtn('csv')} onClick={() => setFormat('csv')}>CSV</button>
              <button className={fmtBtn('json')} onClick={() => setFormat('json')}>JSON</button>
              <button className={fmtBtn('sql')} onClick={() => setFormat('sql')}>SQL</button>
            </div>
          </div>

          {/* CSV options */}
          {format === 'csv' && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Delimiter</label>
                <select
                  value={options.delimiter ?? ','}
                  onChange={(e) => set('delimiter', e.target.value)}
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  <option value=",">Comma (,)</option>
                  <option value="&#9;">Tab (\t)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={options.includeHeader !== false}
                  onChange={(e) => set('includeHeader', e.target.checked)}
                  className="rounded"
                />
                Include header row
              </label>
            </div>
          )}

          {/* JSON options */}
          {format === 'json' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={options.pretty ?? false}
                  onChange={(e) => set('pretty', e.target.checked)}
                  className="rounded"
                />
                Pretty print
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={options.arrayOfArrays ?? false}
                  onChange={(e) => set('arrayOfArrays', e.target.checked)}
                  className="rounded"
                />
                Array of arrays (instead of objects)
              </label>
            </div>
          )}

          {/* SQL options */}
          {format === 'sql' && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Table name</label>
                <input
                  type="text"
                  value={options.tableName ?? 'export'}
                  onChange={(e) => set('tableName', e.target.value)}
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  placeholder="export"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Rows per INSERT</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={options.batchSize ?? 100}
                  onChange={(e) => set('batchSize', Number(e.target.value))}
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={options.includeCreateTable ?? false}
                  onChange={(e) => set('includeCreateTable', e.target.checked)}
                  className="rounded"
                />
                Include CREATE TABLE statement
              </label>
            </div>
          )}

          {/* Preview */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
              Preview (first 5 rows)
            </label>
            <PreviewRows result={result} format={format} options={options} />
          </div>

          {/* Progress */}
          {isExporting && (
            <ExportProgress isExporting={isExporting} onComplete={handleExportComplete} />
          )}

          {/* Error */}
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {!isExporting && (
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <button
              onClick={onClose}
              className="rounded px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
            >
              <Download size={12} />
              Export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
