import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type CellClassParams,
  type ICellRendererParams,
  type GridReadyEvent,
} from "ag-grid-community";
import { Save, Plus, Trash2, Undo2, Redo } from "lucide-react";
import type { QueryResult, ColumnType, ColumnInfo } from "../../types";
import { useChangeStore } from "../../stores/changes";
import { useSettingsStore } from "../../stores/settings";
import { isDarkMode } from "../../utils/theme";
import { SaveChangesDialog } from "./SaveChangesDialog";
import type { DatabaseType } from "../../types";

ModuleRegistry.registerModules([AllCommunityModule]);

function isJsonType(ct: ColumnType): boolean {
  return ct.type === "Json";
}

function isBooleanType(ct: ColumnType): boolean {
  return ct.type === "Boolean";
}

function isDateType(ct: ColumnType): boolean {
  return ct.type === "Date" || ct.type === "Timestamp" || ct.type === "DateTime";
}

function isBlobType(ct: ColumnType): boolean {
  return ct.type === "Blob";
}

interface DataGridProps {
  result: QueryResult;
  onCellEdit?: (rowIndex: number, column: string, value: string | null) => void;
  editable?: boolean;
  tabId?: string;
  tableName?: string;
  dbType?: DatabaseType;
  connectionId?: string;
  columns?: ColumnInfo[];
  onRefresh?: () => void;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function Pagination({ currentPage, totalPages, pageSize, totalRows, onPageChange, onPageSizeChange }: PaginationProps) {
  return (
    <div className="flex h-8 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {[50, 100, 200, 500, 1000].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span>{totalRows.toLocaleString()} rows</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(0)}
            disabled={currentPage === 0}
            className="rounded px-1.5 py-0.5 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            ««
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 0}
            className="rounded px-1.5 py-0.5 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            «
          </button>
          <span className="px-2">
            {currentPage + 1} / {Math.max(totalPages, 1)}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            className="rounded px-1.5 py-0.5 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            »
          </button>
          <button
            onClick={() => onPageChange(totalPages - 1)}
            disabled={currentPage >= totalPages - 1}
            className="rounded px-1.5 py-0.5 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            »»
          </button>
        </div>
      </div>
    </div>
  );
}

export function DataGrid({ result, onCellEdit, editable, tabId, tableName, dbType, connectionId, columns: columnInfos, onRefresh }: DataGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [jsonModal, setJsonModal] = useState<{ value: string; column: string } | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const themeStr = useSettingsStore((s) => s.settings?.appearance.theme ?? "system");
  const gridTheme = themeStr === "light" ? "ag-theme-alpine" : themeStr === "dark" ? "ag-theme-alpine" : (isDarkMode() ? "ag-theme-alpine" : "ag-theme-alpine");

  const recordCellEdit = useChangeStore((s) => s.recordCellEdit);
  const recordRowInsert = useChangeStore((s) => s.recordRowInsert);
  const recordRowDelete = useChangeStore((s) => s.recordRowDelete);
  const undoLastChange = useChangeStore((s) => s.undoLastChange);
  const redoChange = useChangeStore((s) => s.redoChange);
  const getChangeCount = useChangeStore((s) => s.getChangeCount);
  const tabChanges = useChangeStore((s) => tabId ? s.getTabChanges(tabId) : undefined);

  const changeCount = tabId ? getChangeCount(tabId) : 0;

  useEffect(() => {
    if (!tabId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undoLastChange(tabId);
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redoChange(tabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabId, undoLastChange, redoChange]);

  const totalRows = result.rows.length;
  const totalPages = Math.ceil(totalRows / pageSize);
  const pageRows = useMemo(
    () => result.rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [result.rows, currentPage, pageSize],
  );

  const rowData = useMemo(
    () =>
      pageRows.map((row, idx) => {
        const obj: Record<string, string | null> = { __rowIndex: String(currentPage * pageSize + idx) };
        result.columns.forEach((col, ci) => {
          obj[col] = row[ci];
        });
        return obj;
      }),
    [pageRows, result.columns, currentPage, pageSize],
  );

  const changedCells = useMemo(() => {
    if (!tabChanges) return new Set<string>();
    const set = new Set<string>();
    for (const u of tabChanges.updates) {
      set.add(`${u.rowIndex}:${u.column}`);
    }
    return set;
  }, [tabChanges]);

  const deletedRows = useMemo(() => {
    return tabChanges?.deletes ?? new Set<number>();
  }, [tabChanges]);

  const columnDefs: ColDef[] = useMemo(
    () =>
      result.columns.map((col, ci) => {
        const colType = result.column_types[ci];
        const def: ColDef = {
          field: col,
          headerName: col,
          resizable: true,
          sortable: true,
          editable: editable && !isBlobType(colType),
          minWidth: 80,
          cellStyle: (params: CellClassParams) => {
            const rowIdx = Number(params.data?.__rowIndex);
            if (deletedRows.has(rowIdx)) {
              return { backgroundColor: "rgba(239, 68, 68, 0.15)", textDecoration: "line-through", color: "#ef4444" } as Record<string, string>;
            }
            if (changedCells.has(`${rowIdx}:${col}`)) {
              return { backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#eab308" } as Record<string, string>;
            }
            if (params.value === null) {
              return { color: "#6b7280", fontStyle: "italic" } as Record<string, string>;
            }
            return undefined;
          },
          valueFormatter: (params) => {
            if (params.value === null) return "NULL";
            if (isBlobType(colType)) return "(BLOB)";
            return params.value;
          },
        };

        if (isBooleanType(colType)) {
          def.cellRenderer = (params: ICellRendererParams) => {
            if (params.value === null) return "NULL";
            const checked = params.value === "1" || params.value === "true" || params.value === "t";
            return `<input type="checkbox" ${checked ? "checked" : ""} disabled style="pointer-events:none" />`;
          };
          def.width = 80;
        }

        if (isJsonType(colType)) {
          def.cellRenderer = (params: ICellRendererParams) => {
            if (params.value === null) return '<span style="color:#6b7280;font-style:italic">NULL</span>';
            return `<span style="color:#60a5fa;cursor:pointer;text-decoration:underline">{JSON}</span>`;
          };
          def.onCellClicked = (params) => {
            if (params.value !== null) {
              setJsonModal({ value: params.value, column: col });
            }
          };
        }

        if (isDateType(colType)) {
          def.width = 160;
        }

        return def;
      }),
    [result.columns, result.column_types, editable, changedCells, deletedRows],
  );

  const defaultColDef = useMemo(
    () => ({
      flex: 1,
      minWidth: 100,
    }),
    [],
  );

  const onGridReady = useCallback((_params: GridReadyEvent) => {
    // Grid ready
  }, []);

  return (
    <div className="flex h-full flex-col">
      {editable && tabId && (
        <div className="flex h-8 items-center gap-2 border-b border-zinc-200 bg-zinc-50/50 px-3 dark:border-zinc-700 dark:bg-zinc-900/50">
          <button
            onClick={() => tabId && recordRowInsert(tabId, {})}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-green-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-green-400"
            title="Add Row"
          >
            <Plus size={12} />
            Add Row
          </button>
          <button
            onClick={() => {
              const selected = gridRef.current?.api.getSelectedRows();
              if (selected && tabId) {
                for (const row of selected) {
                  recordRowDelete(tabId, Number(row.__rowIndex));
                }
              }
            }}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
            title="Delete Selected Rows"
          >
            <Trash2 size={12} />
            Delete
          </button>

          <div className="flex-1" />

          <button
            onClick={() => tabId && undoLastChange(tabId)}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={() => tabId && redoChange(tabId)}
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Redo (Ctrl+Y)"
          >
            <Redo size={14} />
          </button>

          {changeCount > 0 && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-0.5 text-xs font-medium text-white transition hover:bg-amber-500"
            >
              <Save size={12} />
              Save ({changeCount})
            </button>
          )}
        </div>
      )}

      <div className={`${gridTheme} flex-1`}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowSelection="multiple"
          onGridReady={onGridReady}
          animateRows={false}
          suppressCellFocus={false}
          enableCellTextSelection={true}
          onCellValueChanged={(e) => {
            if (e.colDef.field) {
              const rowIndex = Number(e.data.__rowIndex);
              if (tabId) {
                recordCellEdit(tabId, rowIndex, e.colDef.field, e.oldValue, e.newValue);
              }
              if (onCellEdit) {
                onCellEdit(rowIndex, e.colDef.field, e.newValue);
              }
            }
          }}
        />
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalRows={totalRows}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(0);
        }}
      />

      {jsonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setJsonModal(null)}
        >
          <div
            className="max-h-[80vh] w-[600px] overflow-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {jsonModal.column}
              </h3>
              <button
                onClick={() => setJsonModal(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <pre className="overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(jsonModal.value), null, 2);
                } catch {
                  return jsonModal.value;
                }
              })()}
            </pre>
          </div>
        </div>
      )}

      {showSaveDialog && tabId && tableName && dbType && connectionId && columnInfos && (
        <SaveChangesDialog
          tabId={tabId}
          table={tableName}
          dbType={dbType}
          connectionId={connectionId}
          columns={columnInfos}
          rows={result.rows}
          onClose={() => setShowSaveDialog(false)}
          onSaved={() => onRefresh?.()}
        />
      )}
    </div>
  );
}
