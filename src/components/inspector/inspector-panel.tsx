import { useState } from 'react';
import { Rows3, List, Braces } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FieldRow } from './field-row';
import { JsonRecordView } from './json-record-view';
import type { ColumnInfo } from '../../types/query';

type ViewMode = 'list' | 'json';

interface InspectorPanelProps {
  columns: ColumnInfo[];
  row: (string | null)[] | null;
}

/** Renders inside the right dock (M2) — the dock owns the close control and
 *  Escape handling, so this panel is content only. */
export function InspectorPanel({ columns, row }: InspectorPanelProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const toggleBtnCls = (active: boolean) =>
    `flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
      active
        ? "bg-surface-muted text-text-primary"
        : "text-text-secondary hover:text-text-primary hover:bg-surface-muted"
    }`;

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold text-text-primary">{t("inspector.title")}</span>
        {row !== null && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className={toggleBtnCls(viewMode === 'list')}
              onClick={() => setViewMode('list')}
              title={t("inspector.listView")}
              aria-label={t("inspector.listView")}
            >
              <List size={11} />
              {t("inspector.list")}
            </button>
            <button
              type="button"
              className={toggleBtnCls(viewMode === 'json')}
              onClick={() => setViewMode('json')}
              title={t("inspector.jsonView")}
              aria-label={t("inspector.jsonView")}
            >
              <Braces size={11} />
              {t("inspector.json")}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {row === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-secondary">
          <Rows3 size={24} />
          <span className="text-xs">{t("inspector.selectRow")}</span>
        </div>
      ) : viewMode === 'json' ? (
        <JsonRecordView columns={columns} row={row} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {columns.map((col, i) => (
            <FieldRow
              key={col.name}
              name={col.name}
              typeName={col.typeName}
              value={row[i] ?? null}
              isPrimaryKey={col.isPrimaryKey}
            />
          ))}
        </div>
      )}

      {/* Footer with column count */}
      {row !== null && (
        <div className="border-t border-border px-3 py-1 text-[10px] text-text-secondary">
          {t("inspector.columnCount", { count: columns.length })}
        </div>
      )}
    </div>
  );
}
