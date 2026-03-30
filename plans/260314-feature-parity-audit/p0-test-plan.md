# P0 Test Plan — Overall Verification Before Moving to P1

> Date: 2026-03-16
> Status: 🔵 PLANNED
> Scope: Comprehensive testing of all 6 P0 features (SQLite driver, Query History, Tab Persistence, Filter Panel, Inspector, Save Changes)
> Infra: Rust unit tests (`cargo test`), Vitest unit tests (`npx vitest run`), both via `powershell.exe`

---

## Current Test Inventory

| Layer | Existing Tests | Test Runner |
|-------|---------------|-------------|
| Rust `sql_generator` | 25+ tests (INSERT/UPDATE/DELETE, escaping, schema) | `cargo test` |
| Rust `query.rs` | 7 tests (`validate_where_clause`) | `cargo test` |
| TS `changeStore` | 11 tests (cell/row changes, undo/redo) | `vitest` |
| TS `editorStore` | 7 tests (add/close/rename tabs) | `vitest` |
| TS `statement-scanner` | 12 tests (SQL splitting, cursor) | `vitest` |
| TS `column-type` | tests (type categorization) | `vitest` |

---

## Test Plan by P0 Feature

### T1 — SQLite Driver (`driver-sqlite`)

**What to test:** The SQLite cdylib driver crate — connect, execute, schema introspection.

> Note: Driver tests require actual SQLite file operations. Test pure logic only (no live DB connection needed for unit tests).

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T1.1 | Schema PRAGMA parsing — `fetch_tables` returns correct TableInfo | `driver-sqlite/src/schema.rs` | Rust unit | Test PRAGMA table_list / table_info parsing |
| T1.2 | Schema PRAGMA parsing — `fetch_columns` maps PRAGMA columns to ColumnInfo | `driver-sqlite/src/schema.rs` | Rust unit | Type mapping (INTEGER→INT, TEXT, REAL, BLOB) |
| T1.3 | Schema PRAGMA parsing — `fetch_indexes` from PRAGMA index_list + index_info | `driver-sqlite/src/schema.rs` | Rust unit | Unique, primary, multi-column |
| T1.4 | Schema PRAGMA parsing — `fetch_foreign_keys` from PRAGMA foreign_key_list | `driver-sqlite/src/schema.rs` | Rust unit | FK columns, ref table, ref columns |
| T1.5 | Connection with empty/missing file path → error | `driver-sqlite/src/driver.rs` | Rust unit | Edge case |
| T1.6 | WAL mode is enabled after connect | `driver-sqlite/src/driver.rs` | Rust integration | Verify PRAGMA journal_mode=WAL |
| T1.7 | Query cancel via `sqlite3_interrupt` | `driver-sqlite/src/driver.rs` | Rust unit | Verify cancel mechanism exists |

**Priority:** T1.1-T1.4 (schema parsing is testable without live DB if we mock PRAGMA results), T1.5 (edge case).

---

### T2 — Query History Backend

**What to test:** `HistoryStore` Rust module — CRUD + FTS5 search.

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T2.1 | `insert` + `fetch_recent` — round trip | `storage/history_store.rs` | Rust unit | In-memory SQLite or temp file |
| T2.2 | `fetch_recent` returns newest first (ORDER BY id DESC) | `storage/history_store.rs` | Rust unit | Insert 3, verify order |
| T2.3 | `fetch_recent` respects limit | `storage/history_store.rs` | Rust unit | Insert 5, limit 2 → 2 entries |
| T2.4 | `search` returns FTS5 matches | `storage/history_store.rs` | Rust unit | Insert "SELECT * FROM users", search "users" |
| T2.5 | `search` with empty term falls back to fetch_recent | `storage/history_store.rs` | Rust unit | Verify same behavior as fetch_recent |
| T2.6 | `search` handles FTS5 special characters (quotes, parens) | `storage/history_store.rs` | Rust unit | Query like `SELECT "col"` doesn't crash |
| T2.7 | `delete_entry` removes specific entry | `storage/history_store.rs` | Rust unit | Insert 2, delete 1, verify |
| T2.8 | `delete_entry` on nonexistent ID → error | `storage/history_store.rs` | Rust unit | Edge case |
| T2.9 | `clear_all` removes all entries | `storage/history_store.rs` | Rust unit | Insert 3, clear, fetch → empty |
| T2.10 | FTS5 index stays in sync after delete | `storage/history_store.rs` | Rust unit | Insert, delete, search → no phantom results |

**Approach:** Use `Connection::open_in_memory()` for isolated tests without filesystem side effects. Need to refactor `HistoryStore::new()` to accept a `Connection` for testability OR add a `new_in_memory()` constructor.

---

### T3 — Tab State Persistence (Zustand persist)

**What to test:** `editorStore` persist middleware — serialization, rehydration, edge cases.

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T3.1 | `partialize` truncates content to 100KB | `__tests__/editor-store.test.ts` | Vitest | Add tab with >100KB content, check serialized |
| T3.2 | `partialize` sets isDirty=false on persisted tabs | `__tests__/editor-store.test.ts` | Vitest | Dirty tab → persisted as isDirty:false |
| T3.3 | Rehydration restores tabs and activeTabId | `__tests__/editor-store.test.ts` | Vitest | Simulate localStorage with pre-saved state |
| T3.4 | Rehydration with corrupt JSON → fallback to empty | `__tests__/editor-store.test.ts` | Vitest | Set localStorage to invalid JSON, verify no crash |
| T3.5 | Tab counter resets correctly after rehydration | `__tests__/editor-store.test.ts` | Vitest | Verify `tabCounter` initializes from rehydrated tab count |

---

### T4 — Filter Panel (WHERE Clause Builder)

**What to test:** `buildWhereClause` logic, `FilterCondition` handling, Rust `validate_where_clause`.

#### T4a — Frontend (`filter-types.ts`)

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T4.1 | Basic equality: `column = 'value'` | `__tests__/filter-types.test.ts` | Vitest | Single condition |
| T4.2 | Multiple AND: `col1 = 'a' AND col2 > '5'` | `__tests__/filter-types.test.ts` | Vitest | Two conditions, AND logic |
| T4.3 | Multiple OR: `col1 = 'a' OR col2 = 'b'` | `__tests__/filter-types.test.ts` | Vitest | Two conditions, OR logic |
| T4.4 | IS NULL / IS NOT NULL (unary operators) | `__tests__/filter-types.test.ts` | Vitest | No value input needed |
| T4.5 | LIKE with wildcard: `col LIKE '%term%'` | `__tests__/filter-types.test.ts` | Vitest | |
| T4.6 | BETWEEN with two values | `__tests__/filter-types.test.ts` | Vitest | `value = "1,10"` → `BETWEEN '1' AND '10'` |
| T4.7 | IN with comma-separated values | `__tests__/filter-types.test.ts` | Vitest | `value = "'a','b'"` → `IN ('a','b')` |
| T4.8 | Disabled conditions are excluded | `__tests__/filter-types.test.ts` | Vitest | `enabled: false` → skipped |
| T4.9 | Conditions with no column are excluded | `__tests__/filter-types.test.ts` | Vitest | `column: ''` → skipped |
| T4.10 | All conditions disabled → empty string | `__tests__/filter-types.test.ts` | Vitest | No WHERE clause generated |
| T4.11 | Single-quote escaping in values | `__tests__/filter-types.test.ts` | Vitest | `O'Brien` → `O''Brien` |
| T4.12 | BETWEEN with single-quote escaping | `__tests__/filter-types.test.ts` | Vitest | |

#### T4b — Rust (`query.rs` — existing + new)

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T4.13 | WHERE clause with normal conditions passes validation | `commands/query.rs` | Rust unit | ✅ Already exists |
| T4.14 | Semicolon in WHERE → rejected | `commands/query.rs` | Rust unit | ✅ Already exists |
| T4.15 | SQL comment (`--`) in WHERE → rejected | `commands/query.rs` | Rust unit | ✅ Already exists |
| T4.16 | DDL keywords (DROP/DELETE/ALTER/TRUNCATE) → rejected | `commands/query.rs` | Rust unit | ✅ Already exists |
| T4.17 | Empty WHERE clause passes validation | `commands/query.rs` | Rust unit | **NEW** — edge case |
| T4.18 | Whitespace-only WHERE → treated as empty | `commands/query.rs` | Rust unit | **NEW** — verify `trim()` logic |

---

### T5 — Inspector Panel

**What to test:** Inspector is a pure React component with no complex logic — mainly props-in / render-out. Unit tests focus on data transformation, not rendering.

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T5.1 | Inspector shows "Select a row" when `row` is null | N/A | Manual/E2E | Presentational — no unit test value |
| T5.2 | Inspector renders all columns with correct values | N/A | Manual/E2E | Presentational |
| T5.3 | Inspector shows column count in footer | N/A | Manual/E2E | Presentational |

**Decision:** Inspector is purely presentational (no store logic, no data transformation). Skip unit tests — verify manually or in future E2E tests.

---

### T6 — Save Changes End-to-End

**What to test:** `result-panel.tsx` handleSave builds correct `SavePayload`, wiring to IPC `save_changes`.

#### T6a — SQL Generator (Rust — existing comprehensive suite)

Already covered by 25+ tests in `sql_generator.rs`. No new Rust tests needed.

#### T6b — Frontend Save Payload Construction

| # | Test | File | Type | Notes |
|---|------|------|------|-------|
| T6.1 | `handleSave` does nothing without tableName | `__tests__/result-panel.test.ts` | Vitest | Guard clause check |
| T6.2 | `handleSave` does nothing without sessionId | `__tests__/result-panel.test.ts` | Vitest | Guard clause check |
| T6.3 | `handleSave` does nothing when no changes | `__tests__/result-panel.test.ts` | Vitest | Empty changeStore |
| T6.4 | Cell edit → Update payload: correct columnName, oldValue, newValue | `__tests__/change-store.test.ts` | Vitest | ✅ Partially covered by existing tests |
| T6.5 | Row insert → Insert payload with all cell defaults | `__tests__/change-store.test.ts` | Vitest | ✅ Existing test |
| T6.6 | Row delete → Delete payload with originalRow | `__tests__/change-store.test.ts` | Vitest | ✅ Existing test |
| T6.7 | Mixed changes (insert + update + delete) → all included in payload | `__tests__/change-store.test.ts` | Vitest | **NEW** — combined scenario |
| T6.8 | Primary key columns correctly derived from ColumnInfo.isPrimaryKey | `__tests__/result-panel.test.ts` | Vitest | **NEW** — verify PK extraction |

---

## Summary: New Tests to Write

### Rust (cargo test)

| ID | Description | File | Effort |
|----|-------------|------|--------|
| T2.1-T2.10 | HistoryStore CRUD + FTS5 | `history_store.rs` (add `#[cfg(test)]` module) | M |
| T4.17-T4.18 | Empty/whitespace WHERE validation | `query.rs` (add to existing `mod tests`) | S |

**Prerequisite:** `HistoryStore` needs `new_in_memory()` constructor for testability (currently hardcodes file path).

### TypeScript (vitest)

| ID | Description | File | Effort |
|----|-------------|------|--------|
| T3.1-T3.5 | Editor store persistence edge cases | `__tests__/editor-store.test.ts` (extend) | S |
| T4.1-T4.12 | `buildWhereClause` logic | `__tests__/filter-types.test.ts` (new file) | M |
| T6.7 | Mixed change types in changeStore | `__tests__/change-store.test.ts` (extend) | S |

---

## Execution Plan

```
Phase 1 — Rust tests (parallel):
├── Agent A: T2.1-T2.10 (HistoryStore tests + refactor for testability)
└── Agent B: T4.17-T4.18 (WHERE validation edge cases — tiny)

Phase 2 — TypeScript tests (parallel):
├── Agent C: T4.1-T4.12 (filter-types tests — new file)
├── Agent D: T3.1-T3.5 (editor store persistence tests — extend)
└── Agent E: T6.7 (changeStore mixed changes — extend)

Phase 3 — Run all tests:
├── powershell.exe -Command "cd tablepro-windows; cargo test --manifest-path src-tauri/Cargo.toml"
└── powershell.exe -Command "cd tablepro-windows; npx vitest run"
```

**Estimated effort:** ~2-3 hours with parallel agents.

---

## Pass Criteria

- [ ] All existing Rust tests pass (`cargo test`)
- [ ] All existing Vitest tests pass (`npx vitest run`)
- [ ] All new T2.x HistoryStore tests pass
- [ ] All new T4.x filter-types tests pass
- [ ] All new T3.x persistence edge case tests pass
- [ ] No regressions in T6.x changeStore tests
- [ ] `cargo clippy` clean (no warnings)
- [ ] `npx eslint .` clean

**If all pass → P0 validated. Move to P1.**
