# Phase 4: Data Grid & CRUD

**Duration:** 3 weeks | **Team:** Dev 2 (Frontend, grid) + Dev 1 (Rust, CRUD logic)
**Gate:** Edit cell, add/delete row, save changes, undo/redo, 100K row virtual scroll

## Grid Architecture

macOS uses AppKit `NSTableView` via `DataGridView` (custom SwiftUI wrapper). Windows needs a virtualized HTML table that handles:
- 100K+ rows with smooth scroll (virtual rendering)
- Inline cell editing with type-aware editors
- Column resize, reorder, sort
- Row selection (single, multi, range)
- Copy/paste (cells, rows, as SQL)
- Change tracking (yellow = modified, green = inserted, red = deleted)

### Library Choice: TanStack Table + Custom Virtualizer

```
@tanstack/react-table  — headless table logic (sort, filter, column model)
@tanstack/react-virtual — row virtualization (only render visible rows)
Custom cell renderers    — type-aware display and editing
```

Not using a full DataGrid component (AG Grid, MUI DataGrid) to keep bundle small and control rendering for performance.

## Data Flow

```
User clicks cell → React state → CellEditor component
User types value → local state (optimistic)
User presses Enter → DataChangeManager.recordChange()
                   → Zustand store updates (row state = 'modified')
                   → Visual: cell turns yellow

User clicks "Save" → DataChangeManager.generateStatements()
                   → IPC 'data:save_changes' → Rust
                   → Rust wraps in transaction, executes SQL
                   → Returns success/failure
                   → Clear change tracking on success
```

### Change Tracking (Port of DataChangeManager)

```typescript
// src/stores/changeStore.ts

interface CellChange {
  rowIndex: number;
  columnIndex: number;
  columnName: string;
  oldValue: string | null;
  newValue: string | null;
}

interface RowChange {
  type: 'insert' | 'update' | 'delete';
  rowIndex: number;
  cellChanges: CellChange[];
  originalRow: (string | null)[];
}

interface ChangeState {
  changes: Map<number, RowChange>;  // keyed by rowIndex
  undoStack: RowChange[][];
  redoStack: RowChange[][];
  hasChanges: boolean;

  recordCellChange: (change: CellChange) => void;
  recordRowInsert: (rowIndex: number, defaults: (string | null)[]) => void;
  recordRowDelete: (rowIndex: number) => void;
  undo: () => void;
  redo: () => void;
  generateStatements: (table: string, columns: string[], primaryKeys: string[]) => SavePayload;
  clear: () => void;
}
```

### SQL Statement Generation (Port of SQLStatementGenerator)

Rust side handles SQL generation (dialect-aware escaping, parameter binding):

```rust
// src-tauri/src/services/sql_generator.rs

pub fn generate_save_statements(
    table: &str,
    columns: &[String],
    primary_keys: &[String],
    changes: &[RowChange],
    dialect: SqlDialect,
) -> Vec<(String, Vec<Option<String>>)> {
    changes.iter().map(|change| match change.change_type {
        ChangeType::Insert => generate_insert(table, columns, change, dialect),
        ChangeType::Update => generate_update(table, primary_keys, change, dialect),
        ChangeType::Delete => generate_delete(table, primary_keys, change, dialect),
    }).collect()
}
```

## Implementation Steps

### Week 1: Virtual Grid

- [ ] Set up `@tanstack/react-table` with column model from `ColumnInfo[]`
- [ ] Set up `@tanstack/react-virtual` for row virtualization
- [ ] Implement `DataGrid.tsx`:
  - Column headers with resize handles
  - Sort on click (ASC → DESC → none)
  - Row number gutter
  - NULL display (`<null>` styled like macOS)
  - Sticky header row
- [ ] Implement row selection:
  - Click = single select
  - Shift+Click = range select
  - Ctrl+Click = toggle select
- [ ] Wire pagination: LIMIT/OFFSET from Rust `query:fetch_rows`
- [ ] Implement `Pagination.tsx` (page size selector, page nav, total count)
- [ ] **TEST**: Load 100K rows, smooth virtual scroll, < 2s fetch+render

### Week 2: Cell Editing & Change Tracking

- [ ] Implement `CellEditor.tsx` — inline cell editing on double-click or Enter
- [ ] Type-aware cell editors:
  - Text (default) — single-line input
  - Long text — expandable textarea modal
  - Boolean — toggle/dropdown (TRUE/FALSE/NULL)
  - Date/time — date picker
  - Enum — dropdown (for PG enums)
  - JSON — syntax-highlighted editor modal
  - NULL — explicit "Set NULL" action
- [ ] Implement `changeStore` (Zustand) with full undo/redo
- [ ] Visual change indicators:
  - Modified cell → yellow background
  - Inserted row → green left border
  - Deleted row → red strikethrough
- [ ] Implement "Discard Changes" (reset to server state)
- [ ] Copy/paste:
  - Ctrl+C → copy selected cells (TSV format)
  - Ctrl+V → paste into selected area
  - Copy as SQL INSERT/UPDATE (context menu)
- [ ] Add row / Delete row buttons in toolbar

### Week 3: Save & Transactions + Right Panel

- [ ] Implement `sql_generator.rs` in Rust (port `SQLStatementGenerator.swift`)
  - INSERT with proper escaping per dialect
  - UPDATE with WHERE using primary key columns
  - DELETE with WHERE using primary key columns
  - Parameterized queries to prevent SQL injection
- [ ] Implement `data:save_changes` IPC command:
  - Begin transaction
  - Execute generated statements
  - Commit on success / Rollback on error
  - Return per-statement success/failure
- [ ] Implement "Review Changes" dialog (show SQL preview before save)
- [ ] Implement right sidebar panel:
  - Field list with current row values
  - Editable fields (alternative to inline cell editing)
  - Table metadata (size, row count, engine, comment)
- [ ] Implement filter panel:
  - Column, operator, value rows
  - AND/OR logic toggle
  - Quick search field (LIKE across all columns)
  - Filter → rewrite SQL WHERE clause → re-fetch
- [ ] **BENCHMARK**: 100K row fetch+render < 2s, cell edit feels instant

## Column Type Mapping

Port from macOS `ColumnType.swift`:

```typescript
// src/types/columnType.ts

export type ColumnCategory =
  | 'integer' | 'float' | 'string' | 'date' | 'boolean'
  | 'json' | 'binary' | 'geometry' | 'enum' | 'array' | 'uuid';

export function categorizeColumn(typeName: string, dbType: string): ColumnCategory {
  const upper = typeName.toUpperCase();
  if (['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'SERIAL'].some(t => upper.includes(t)))
    return 'integer';
  if (['FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'MONEY'].some(t => upper.includes(t)))
    return 'float';
  if (['BOOL', 'BOOLEAN', 'BIT'].some(t => upper.includes(t)))
    return 'boolean';
  if (['DATE', 'TIME', 'TIMESTAMP', 'DATETIME'].some(t => upper.includes(t)))
    return 'date';
  if (upper === 'JSON' || upper === 'JSONB')
    return 'json';
  // ... etc
}
```

## Success Criteria

1. DataGrid renders 100K rows with virtual scroll (< 60ms frame time)
2. Inline cell editing with type-aware editors
3. Change tracking: modified/inserted/deleted visual states
4. Undo/redo (Ctrl+Z, Ctrl+Shift+Z) works for cell edits
5. Save changes executes correct SQL (INSERT/UPDATE/DELETE) in transaction
6. Copy/paste cells works (TSV format)
7. Sort, filter, pagination all functional
8. Right sidebar shows field values and table metadata
