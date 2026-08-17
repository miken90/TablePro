import type React from 'react';
import type { SortingState } from '@tanstack/react-table';
import type { QueryResult } from '../../types/query';
import type { FkRef } from '../../stores/schemaStore';
import type { GridSelection, SelectionRect } from './grid-selection';

export interface DataGridProps {
  result: QueryResult;
  pageOffset?: number;
  sorting?: SortingState;
  onSortChange?: (colName: string) => void;
  onCellDoubleClick?: (rowIdx: number, colIdx: number) => void;
  onCellCommit?: (rowIdx: number, colIdx: number, newValue: string | null) => void;
  onCellCancel?: () => void;
  onCellContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
    rowIdx: number,
    colIdx: number,
    cellValue: string | null,
    row: (string | null)[],
  ) => void;
  selectedRows?: Set<number>;
  onRowSelect?: (rowIdx: number, mode: 'single' | 'range' | 'toggle') => void;
  selection?: GridSelection;
  selectionRect?: SelectionRect | null;
  onCellClick?: (rowId: number, col: number) => void;
  onRowHeaderClick?: (rowId: number) => void;
  changedRows?: Map<number, 'modified' | 'inserted' | 'deleted'>;
  editingCell?: { rowIdx: number; colIdx: number } | null;
  cellOverrideValues?: Map<string, string | null>;
  enumValuesByColumn?: Record<string, string[]>;
  fkColumns?: Record<string, FkRef>;
  onFkNavigate?: (refTable: string, refColumn: string, refSchema: string | undefined, value: string) => void;
  rowIds?: number[];
  onMoveActive?: (dx: number, dy: number) => void;
  onMoveNext?: () => void;
  onMovePrev?: () => void;
  onMoveToFirst?: () => void;
  onMoveToLast?: () => void;
  onMoveToRowStart?: () => void;
  onMoveToRowEnd?: () => void;
  onMoveActivePage?: (direction: number, visibleRowCount: number) => void;
  onStartEditingActive?: () => void;
  onClearSelection?: () => void;
  onExtendTo?: (rowId: number, col: number) => void;
  onExtendActive?: (dx: number, dy: number) => void;
  onBeginDrag?: (rowId: number, col: number) => void;
  onUpdateDrag?: (rowId: number, col: number) => void;
  onEndDrag?: () => void;
  isDragging?: boolean;
  onSelectColumn?: (col: number) => void;
  onSelectAll?: () => void;
  /** Ref forwarded to the scroll container so parents can call scrollTo */
  scrollRef?: React.RefObject<HTMLDivElement>;
  sessionId?: string;
  /** Whether the grid is in table-browse mode (enables checkbox selection). */
  isTableMode?: boolean;
}
