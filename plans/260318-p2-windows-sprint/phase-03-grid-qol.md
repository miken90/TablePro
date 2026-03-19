---
phase: 3
features: [copy-as-sql, enum-picker, approx-row-count]
effort: 3-4d
risk: LOW-MED
---

# Phase 3: Grid Quality-of-Life

## Context

- Plan: [plan.md](./plan.md)
- Existing: `sql_generator.rs` generates INSERT/UPDATE/DELETE for save operations
- Existing: `CellEditor` handles type-aware editing

## Overview

Three data grid improvements: (1) copy selected rows as INSERT SQL, (2) dropdown picker for ENUM/SET columns, (3) instant approximate row count for large tables.

---

## Feature 3A: Copy as INSERT SQL

**What:** Right-click row(s) → context menu → "Copy as INSERT" / "Copy as UPDATE". Generates SQL and copies to clipboard.

### Implementation

#### [MODIFY] `src-tauri/src/services/sql_generator.rs`
- Add `pub fn generate_insert_sql(table: &str, columns: &[String], rows: &[Vec<serde_json::Value>], driver_type: &str) -> String`
- Uses existing `quote_identifier` from `sql_quoting.rs`
- Properly escapes values based on column type

#### [NEW] `src-tauri/src/commands/data.rs` (or extend existing)
- New command: `generate_row_sql` — accepts session_id, table, columns, row_data, output_format (INSERT/UPDATE)
- Returns SQL string

#### [MODIFY] `src/components/grid/result-panel.tsx` (or result-toolbar)
- Add context menu on row right-click
- Items: "Copy as INSERT", "Copy as UPDATE", "Copy Row (Tab-separated)", "Copy Cell"
- Use `navigator.clipboard.writeText()` to copy

#### [NEW] `src/components/grid/grid-context-menu.tsx`
- Context menu component with SQL generation options
- Receives selected rows + column info
- Calls IPC `generate_row_sql` → copies result

### Tests
- Rust unit test: `generate_insert_sql` with various column types, special chars, NULL values
- Rust unit test: proper quoting per driver type

---

## Feature 3B: ENUM/SET Picker

**What:** When cell column type is ENUM or SET (MySQL), show dropdown picker instead of free-text input.

### Implementation

> [!IMPORTANT]
> `ColumnInfo` is in `models/query.rs` (NOT `schema.rs`). Do NOT add `enum_values` to `ColumnInfo` — that would require plugin-sdk ABI change across all 4 drivers.

#### Approach: Separate IPC command (no ABI change)

#### [NEW] `src-tauri/src/commands/schema.rs` — add `fetch_enum_values`
- New command: `fetch_enum_values(session_id, table, column)` → returns `Vec<String>`
- MySQL: query `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME=?`, parse `enum('a','b','c')` → `['a','b','c']`
- PostgreSQL: query `SELECT unnest(enum_range(NULL::type_name))` or `pg_enum` table
- MSSQL/SQLite: return empty (no ENUM support)
- Execute via driver's `execute()` method, parse result

#### [NEW] `src/components/grid/enum-cell-editor.tsx`
- Dropdown `<select>` component listing ENUM values
- For SET: multi-select checkboxes (comma-separated values)
- Fallback: if no enum values, show normal text input

#### [MODIFY] `src/components/grid/CellEditor.tsx` (or equivalent)
- If column type is ENUM/SET and `enumValues` available → render `EnumCellEditor`
- Else → existing text/number/boolean editor

### Tests
- Manual: connect to MySQL with ENUM column → click cell → verify dropdown appears with correct values
- Manual: SET column → verify multi-select works

---

## Feature 3C: Approximate Row Count

**What:** Show instant approximate row count for large tables (no full COUNT(*) query). Uses database metadata.

### Implementation

#### [MODIFY] `src-tauri/src/commands/schema.rs`
- New command: `fetch_approximate_count(session_id, table, schema)`
- Per-driver SQL:
  - PostgreSQL: `SELECT reltuples::bigint FROM pg_class WHERE relname = $1`
  - MySQL: `SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = ?`
  - MSSQL: `SELECT SUM(rows) FROM sys.partitions WHERE object_id = OBJECT_ID(?) AND index_id IN (0,1)`
  - SQLite: fallback to `SELECT COUNT(*) FROM table` (small tables, always fast)

#### [MODIFY] `src/components/grid/result-toolbar.tsx` (or result-status-bar)
- On table open → call `fetch_approximate_count` immediately
- Display "~1.2M rows" in status bar (while exact count loads from pagination)
- Prefix with "~" to indicate approximate
- When exact count available → replace with exact

#### [NEW] `src/ipc/commands.ts` addition
- Add `fetchApproximateCount(sessionId, table, schema)` IPC wrapper

### Tests
- Rust unit test: parse approx count from mock result
- Manual: open large PG table → verify "~N rows" appears instantly before data loads

---

## File Ownership

| Feature | Rust files | Frontend files |
|---------|-----------|----------------|
| 3A Copy SQL | `services/sql_generator.rs`, `commands/data.rs` | `grid-context-menu.tsx` (new), `result-panel.tsx` |
| 3B ENUM | `commands/schema.rs` (add `fetch_enum_values`) | `enum-cell-editor.tsx` (new), `CellEditor.tsx` |
| 3C Approx Count | `commands/schema.rs` | `result-toolbar.tsx`, `ipc/commands.ts` |

**No conflicts** — 3A and 3B can be parallel. 3C independent.

## Todo

- [x] Add `generate_insert_sql` function to sql_generator
- [x] Add `generate_row_sql` Tauri command
- [x] Create grid context menu with "Copy as INSERT/UPDATE"
- [x] Verify MySQL driver returns ENUM values
- [x] Create ENUM cell editor dropdown
- [x] Integrate ENUM editor into CellEditor
- [x] Add `fetch_approximate_count` command with per-driver SQL
- [x] Show approx count in status bar
- [x] Tests for SQL generation and approx count

## Success Criteria

- [ ] Right-click row → "Copy as INSERT" → clipboard has valid SQL
- [ ] MySQL ENUM column → dropdown picker with correct values
- [ ] Large PG table → "~N rows" shown instantly in status bar
- [ ] All generated SQL uses correct per-driver quoting
