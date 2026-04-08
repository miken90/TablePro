import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { bulkDelete, bulkDeletePreview } from '../../ipc/commands';
import type { FilterCondition } from '../../ipc/commands';
import { useToast } from '../../hooks/useToast';
import type { ColumnInfo } from '../../types/query';

interface BulkDeleteDialogProps {
  open: boolean;
  sessionId: string;
  table: string;
  schema: string | null;
  columns: ColumnInfo[];
  onClose: () => void;
  onSuccess: () => void;
}

const OPERATORS = ['=', '!=', '<', '>', '<=', '>=', 'IS NULL', 'IS NOT NULL', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'BETWEEN'] as const;
const NO_VALUE_OPS = new Set(['IS NULL', 'IS NOT NULL']);

interface FilterRow {
  id: number;
  column: string;
  operator: string;
  value: string;
}

let nextFilterId = 1;

function makeFilter(columns: ColumnInfo[]): FilterRow {
  return {
    id: nextFilterId++,
    column: columns[0]?.name ?? '',
    operator: '=',
    value: '',
  };
}

export function BulkDeleteDialog({
  open, sessionId, table, schema, columns, onClose, onSuccess,
}: BulkDeleteDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const [filters, setFilters] = useState<FilterRow[]>(() => [makeFilter(columns)]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const addFilter = useCallback(() => {
    setFilters((prev) => [...prev, makeFilter(columns)]);
    setPreviewCount(null);
  }, [columns]);

  const removeFilter = useCallback((id: number) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
    setPreviewCount(null);
  }, []);

  const updateFilter = useCallback((id: number, field: keyof FilterRow, val: string) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)),
    );
    setPreviewCount(null);
  }, []);

  const filterConditions: FilterCondition[] = useMemo(
    () =>
      filters.map((f) => ({
        column: f.column,
        operator: f.operator,
        value: NO_VALUE_OPS.has(f.operator) ? null : f.value,
      })),
    [filters],
  );

  const filtersValid = useMemo(
    () =>
      filters.length > 0 &&
      filters.every(
        (f) => f.column && f.operator && (NO_VALUE_OPS.has(f.operator) || f.value.length > 0),
      ),
    [filters],
  );

  const handlePreview = useCallback(async () => {
    if (!filtersValid) return;
    setIsPreviewing(true);
    try {
      const count = await bulkDeletePreview(sessionId, table, schema, filterConditions);
      setPreviewCount(count);
    } catch (err) {
      toast.showError(t('grid.bulk.deleteFailed'), err);
    } finally {
      setIsPreviewing(false);
    }
  }, [filtersValid, sessionId, table, schema, filterConditions, t, toast]);

  const handleDelete = useCallback(async () => {
    if (!filtersValid) return;
    setIsDeleting(true);
    try {
      const result = await bulkDelete(sessionId, table, schema, filterConditions);
      toast.success(
        t('grid.bulk.deleteSuccess', { count: result.rowsAffected, ms: result.durationMs }),
      );
      onSuccess();
      onClose();
    } catch (err) {
      toast.showError(t('grid.bulk.deleteFailed'), err);
    } finally {
      setIsDeleting(false);
    }
  }, [filtersValid, sessionId, table, schema, filterConditions, t, toast, onSuccess, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[600px] max-w-[90vw] max-h-[85vh] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t('grid.bulk.deleteTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{table}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
            <X size={16} className="text-zinc-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-4">
          {/* Filter conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Filters (WHERE)
              </span>
              <button
                type="button"
                onClick={addFilter}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              >
                <Plus size={12} />
                {t('grid.bulk.addFilter')}
              </button>
            </div>
            <div className="space-y-2">
              {filters.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <select
                    value={f.column}
                    onChange={(e) => updateFilter(f.id, 'column', e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={f.operator}
                    onChange={(e) => updateFilter(f.id, 'operator', e.target.value)}
                    className="w-28 px-2 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  {!NO_VALUE_OPS.has(f.operator) && (
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, 'value', e.target.value)}
                      placeholder={t('grid.bulk.value')}
                      className="flex-1 px-2 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    />
                  )}
                  {NO_VALUE_OPS.has(f.operator) && <div className="flex-1" />}
                  <button
                    type="button"
                    onClick={() => removeFilter(f.id)}
                    disabled={filters.length <= 1}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('grid.bulk.removeFilter')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview count */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!filtersValid || isPreviewing}
              className="px-3 py-1.5 text-xs font-medium rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPreviewing ? '...' : t('grid.bulk.dryRun')}
            </button>
            {previewCount !== null && (
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {t('grid.bulk.willDelete', { count: previewCount })}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            {t('grid.bulk.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || !filtersValid}
            className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? t('grid.bulk.deleting') : t('grid.bulk.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
