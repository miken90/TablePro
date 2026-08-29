import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { bulkDelete, bulkDeletePreview } from '../../ipc/commands';
import type { FilterCondition } from '../../ipc/commands';
import type { ColumnInfo } from '../../types/query';
import { Dialog } from '../ui';

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
      console.error(t('grid.bulk.deleteFailed'), err);
    } finally {
      setIsPreviewing(false);
    }
  }, [filtersValid, sessionId, table, schema, filterConditions, t]);

  const handleDelete = useCallback(async () => {
    if (!filtersValid) return;
    setIsDeleting(true);
    try {
      await bulkDelete(sessionId, table, schema, filterConditions);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(t('grid.bulk.deleteFailed'), err);
    } finally {
      setIsDeleting(false);
    }
  }, [filtersValid, sessionId, table, schema, filterConditions, t, onSuccess, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('grid.bulk.deleteTitle')}
      size="md"
      destructive
      cancelLabel={t('grid.bulk.cancel')}
      actions={[{
        label: isDeleting ? t('grid.bulk.deleting') : t('grid.bulk.delete'),
        onClick: () => void handleDelete(),
        disabled: isDeleting || !filtersValid,
        loading: isDeleting,
        variant: 'danger',
      }]}
    >
      <p className="-mt-2 mb-4 text-xs text-text-secondary">{table}</p>

      {/* Filter conditions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-text-secondary">
            Filters (WHERE)
          </span>
          <button
            type="button"
            onClick={addFilter}
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-border hover:bg-surface-hover text-text-secondary hover:text-text-primary"
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
                className="flex-1 px-2 py-1.5 text-xs rounded border border-border bg-surface-elevated text-text-primary"
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) => updateFilter(f.id, 'operator', e.target.value)}
                className="w-28 px-2 py-1.5 text-xs rounded border border-border bg-surface-elevated text-text-primary"
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
                  className="flex-1 px-2 py-1.5 text-xs rounded border border-border bg-surface-elevated text-text-primary"
                />
              )}
              {NO_VALUE_OPS.has(f.operator) && <div className="flex-1" />}
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                disabled={filters.length <= 1}
                className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-red disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('grid.bulk.removeFilter')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Preview count */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={!filtersValid || isPreviewing}
          className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-surface-hover text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPreviewing ? '...' : t('grid.bulk.dryRun')}
        </button>
        {previewCount !== null && (
          <span className="text-xs text-text-secondary">
            {t('grid.bulk.willDelete', { count: previewCount })}
          </span>
        )}
      </div>
    </Dialog>
  );
}
