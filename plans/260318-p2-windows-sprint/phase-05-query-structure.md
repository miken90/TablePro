---
phase: 5
features: [query-progress-events, create-table-wizard]
effort: 5-7d
risk: MED-HIGH
---

# Phase 5: Query & Structure

## Context

- Plan: [plan.md](./plan.md)
- Existing: Tauri event system used for import progress (`import_progress`)
- Existing: Structure view with Columns, Indexes, FKs, DDL tabs

## Overview

Two medium-complexity features: (1) real-time query execution progress events, (2) visual Create Table wizard.

---

## Feature 5A: Query Progress Events

**What:** Show real-time progress during long-running queries: elapsed time, rows affected (if available), status text.

### Implementation

> [!IMPORTANT]
> `execute_query` currently has NO `AppHandle` param. Must add it. This changes the frontend IPC call signature.
> Pattern to follow: `commands/import.rs` uses `app: AppHandle` + `app.emit("import_progress", ...)`

#### [MODIFY] `src-tauri/src/commands/query.rs`
- **Add `app: AppHandle` parameter** to `execute_query` signature
- Before `driver.execute()`: emit `query:started { sessionId, queryId, timestamp }`
- Spawn background timer (500ms interval) that emits `query:progress { sessionId, queryId, elapsedMs }` until query completes
- After `driver.execute()` returns: cancel timer, emit `query:completed { sessionId, queryId, elapsedMs, rowCount }`
- On error: emit `query:error { sessionId, queryId, error }`
- **Frontend IPC change:** `invoke('execute_query', ...)` — Tauri auto-injects `AppHandle`, no argument change needed on frontend side

#### [NEW] `src/hooks/useQueryProgress.ts`
- Listen to `query:*` Tauri events via `listen()`
- Track: isRunning, elapsedMs, status text
- Clean up listeners on unmount

#### [MODIFY] `src/components/grid/result-toolbar.tsx` (or result-status-bar)
- While query running: show spinner + elapsed time ("Running... 2.3s")
- On complete: show "Completed in 1.2s — 500 rows"
- On error: show error status

#### [MODIFY] `src/components/editor/sql-editor.tsx`
- Show running indicator near execute button during query execution

### Tests
- Manual: run `SELECT pg_sleep(5)` → verify elapsed time ticks up
- Manual: run normal query → verify "Completed in Xs" shown

---

## Feature 5B: Create Table Wizard

**What:** Visual GUI to define and execute CREATE TABLE DDL. Define columns (name, type, nullable, default), primary key, and generate + execute the DDL.

### Implementation

#### [NEW] `src/components/structure/create-table-wizard.tsx`
- Multi-step form:
  1. Table name + schema (if PG)
  2. Columns: name, type dropdown, nullable toggle, default value, primary key checkbox
  3. Preview generated DDL
  4. Execute button
- "Add Column" / "Remove Column" buttons
- Column types per driver: common types (INT, VARCHAR, TEXT, BOOLEAN, DATE, TIMESTAMP, DECIMAL, BIGINT, JSON, UUID)

#### [NEW] `src/components/structure/column-definition-row.tsx`
- Single column row in wizard: name input, type dropdown, nullable checkbox, default input, PK checkbox

#### [NEW] `src-tauri/src/services/ddl_generator.rs`
- `fn generate_create_table(table_name: &str, columns: &[ColumnDefinition], driver_type: &str) -> String`
- Per-driver DDL syntax:
  - PG: `CREATE TABLE "schema"."table" (...)` with `SERIAL` for auto-increment
  - MySQL: `CREATE TABLE \`table\` (...)` with `AUTO_INCREMENT`
  - MSSQL: `CREATE TABLE [table] (...)` with `IDENTITY(1,1)`
  - SQLite: `CREATE TABLE "table" (...)` with `INTEGER PRIMARY KEY AUTOINCREMENT`
- Uses `quote_identifier` from `sql_quoting.rs`

#### [NEW] `src-tauri/src/commands/structure.rs`
- Command: `create_table(session_id, table_definition)` — generates DDL → executes via driver → refreshes schema

#### [MODIFY] `src-tauri/src/lib.rs`
- Register `create_table` command

#### [MODIFY] `src/components/layout/Sidebar.tsx`
- Add "New Table" button/context menu item
- Opens Create Table wizard dialog

### Tests
- Rust unit test: DDL generation for each driver type with various column combinations
- Manual: create table with wizard → verify table appears in sidebar → browse data
- Manual: create table with PK + nullable column + default → verify DDL correct

---

## File Ownership

| Feature | Rust files | Frontend files |
|---------|-----------|----------------|
| 5A Progress | `commands/query.rs` | `useQueryProgress.ts` (new), `result-toolbar.tsx`, `sql-editor.tsx` |
| 5B Create Table | `services/ddl_generator.rs` (new), `commands/structure.rs` (new), `lib.rs` | `create-table-wizard.tsx` (new), `column-definition-row.tsx` (new), `Sidebar.tsx` |

**No conflicts** — can parallel.

## Todo

- [x] Add query progress events (started/progress/completed/error)
- [x] Create `useQueryProgress` hook
- [x] Show elapsed time in result toolbar during query execution
- [x] Create DDL generator with per-driver syntax
- [x] Create `create_table` Tauri command
- [x] Create wizard UI (table name, columns, preview DDL)
- [x] Column definition row component
- [x] "New Table" button in sidebar
- [x] Rust tests: DDL generation for PG, MySQL, MSSQL, SQLite
- [ ] Manual tests: long query progress + create table workflow

## Success Criteria

- [ ] Long query → elapsed time shown, updates live
- [ ] Query complete → "Done in X.Xs" status
- [ ] Create Table wizard → enter name + columns → preview DDL → execute → table appears
- [ ] DDL uses correct syntax per database type
- [ ] PK, nullable, default values correctly generated
