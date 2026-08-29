import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { bulkUpdate, bulkUpdatePreview } from '../../ipc/commands';
import type { FilterCondition, ColumnUpdate } from '../../ipc/commands';
import type { ColumnInfo } from '../../types/query';
import { Dialog } from '../ui';

interface BulkUpdateDialogProps {
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

interface SetEntry {
  id: number;
  column: string;
  value: string;
  setNull: boolean;
}

let nextFilterId = 1;
let nextSetId = 1;

function makeFilter(columns: ColumnInfo[]): FilterRow {
  return {
    id: nextFilterId++,
    column: columns[0]?.name ?? '',
    operator: '=',
    value: '',
  };
}

function makeSetEntry(columns: ColumnInfo[]): SetEntry {
  return {
    id: nextSetId++,
    column: columns[0]?.name ?? '',
    value: '',
    setNull: false,
  };
}

export function BulkUpdateDialog({
  open, sessionId, table, schema, columns, onClose, onSuccess,
}: BulkUpdateDialogProps) {
  const { t } = useTranslation();

  const [setEntries, setSetEntries] = useState<SetEntry[]>(() => [makeSetEntry(columns)]);
  const [filters, setFilters] = useState<FilterRow[]>(() => [makeFilter(columns)]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const addSetEntry = useCallback(() => {
    setSetEntries((prev) => [...prev, makeSetEntry(columns)]);
  }, [columns]);

  const removeSetEntry = useCallback((id: number) => {
    setSetEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateSetEntry = useCallback((id: number, field: keyof SetEntry, val: string | boolean) => {
    setSetEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: val } : e)),
    );
  }, []);

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

  const setEntriesValid = useMemo(
    () => setEntries.length > 0 && setEntries.every((e) => e.column),
    [setEntries],
  );

  const handlePreview = useCallback(async () => {
    if (!filtersValid) return;
    setIsPreviewing(true);
    try {
      const count = await bulkUpdatePreview(sessionId, table, schema, filterConditions);
      setPreviewCount(count);
    } catch (err) {
      console.error(t('grid.bulk.updateFailed'), err);
    } finally {
      setIsPreviewing(false);
    }
  }, [filtersValid, sessionId, table, schema, filterConditions, t]);

  const handleUpdate = useCallback(async () => {
    if (!filtersValid || !setEntriesValid) return;
    setIsUpdating(true);
    try {
      const updates: ColumnUpdate[] = setEntries.map((e) => ({
        column: e.column,
        value: e.setNull ? null : e.value,
      }));
      await bulkUpdate(sessionId, table, schema, updates, filterConditions);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(t('grid.bulk.updateFailed'), err);
    } finally {
      setIsUpdating(false);
    }
  }, [filtersValid, setEntriesValid, setEntries, sessionId, table, schema, filterConditions, t, onSuccess, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('grid.bulk.updateTitle')}
      size="md"
      cancelLabel={t('grid.bulk.cancel')}
      actions={[{
        label: isUpdating ? t('grid.bulk.updating') : t('grid.bulk.update'),
        onClick: () => void handleUpdate(),
        disabled: isUpdating || !filtersValid || !setEntriesValid,
        loading: isUpdating,
      }]}
    >
      <p className="-mt-2 mb-4 text-xs text-text-secondary">{table}</p>
      <div className="space-y-4">
          {/* SET entries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                SET
              </span>
              <button
                type="button"
                onClick={addSetEntry}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
              >
                <Plus size={12} />
                {t('grid.bulk.addColumn')}
              </button>
            </div>
            <div className="space-y-2">
              {setEntries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <select
                    value={entry.column}
                    onChange={(e) => updateSetEntry(entry.id, 'column', e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {columns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={entry.setNull ? '' : entry.value}
                    onChange={(e) => updateSetEntry(entry.id, 'value', e.target.value)}
                    disabled={entry.setNull}
                    placeholder={entry.setNull ? 'NULL' : ''}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
                  />
                  <label className="flex items-center gap-1 text-xs text-zinc-500 whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={entry.setNull}
                      onChange={(e) => updateSetEntry(entry.id, 'setNull', e.target.checked)}
                      className="w-3 h-3"
                    />
                    NULL
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSetEntry(entry.id)}
                    disabled={setEntries.length <= 1}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('grid.bulk.removeColumn')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

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
                {t('grid.bulk.willUpdate', { count: previewCount })}
              </span>
            )}
          </div>
      </div>
    </Dialog>
  );
}
