# P2 Windows Sprint — Validation Report

> Date: 2026-03-18
> Reviewed by: Direct codebase verification + adversarial review agent
> Plan: `plans/260318-p2-windows-sprint/`

---

## Validation Summary

| Phase | Issues Found | Severity |
|-------|-------------|----------|
| Phase 1: Auto-Updater | 2 | LOW |
| Phase 2: Connection Polish | 3 | LOW-MED |
| Phase 3: Grid QoL | 4 | MED |
| Phase 4: Filter & Search | 3 | MED |
| Phase 5: Query & Structure | 3 | MED-HIGH |
| Phase 6: Polish & Packaging | 3 | MED |

---

## Phase 1: Auto-Updater

### Issue 1.1: `execute_query` needs `AppHandle` (LOW)
- **Plan says:** "Register plugin in lib.rs"
- **Status:** CONFIRMED needed. `lib.rs` currently only has `tauri_plugin_dialog::init()`. Adding updater is straightforward.
- **Fix:** No plan change needed.

### Issue 1.2: Updater endpoint not specified (LOW)
- **Plan says:** placeholder URL
- **Status:** Acceptable for plan stage. Must be set up before release.
- **Fix:** No plan change needed — flagged as prerequisite.

---

## Phase 2: Connection Polish

### Issue 2.1: `SavedConnection` needs 3 new fields (LOW)
- **Plan says:** Add `color`, `tag`, `startup_commands`
- **Verified:** `SavedConnection` at `models/connection.rs:63-72` has only `id`, `name`, `config`, `group_id`. Confirmed fields missing.
- **Fix:** Plan correct. Add with `#[serde(default)]` for backward compat.

### Issue 2.2: `startup_commands` should be on `ConnectionConfig` not `SavedConnection` (MED)
- **Plan says:** "Add `startup_commands: Option<String>` to `ConnectionConfig`"
- **Status:** CONFIRMED correct location. But plan also says modify `commands/connection.rs` — need to verify `connect()` function signature.
- **Verified:** `connect()` in `commands/connection.rs` receives config. Plan is correct.

### Issue 2.3: `ConnectionForm.tsx` size concern (MED)
- **Plan says:** Add 4 features to ConnectionForm
- **Verified:** Previous P1 work already touched this file. It was 380L in parity audit. After P1 it may be larger.
- **Impact:** May need splitting into sub-components. Plan already suggests sub-components (`connection-color-picker.tsx`, `connection-tag-picker.tsx`) — acceptable.

---

## Phase 3: Grid QoL

### ❌ Issue 3.1: WRONG FILE — `ColumnInfo` is in `models/query.rs` NOT `models/schema.rs` (MED)
- **Plan says:** "Modify `src-tauri/src/models/schema.rs` — Ensure `ColumnInfo` has `enum_values` field"
- **Actual:** `ColumnInfo` is defined at `models/query.rs:6-11` with fields: `name`, `type_name`, `nullable`, `is_primary_key`. NO `enum_values` field.
- **Fix:** Plan must reference `models/query.rs` instead of `models/schema.rs`.

### ❌ Issue 3.2: `ColumnInfo` has no `enum_values` — requires SDK/driver changes (MED)
- **Plan says:** add `enum_values: Option<Vec<String>>`
- **Impact:** Adding to `ColumnInfo` is host-side only. But `ColumnInfo` is populated from `FfiColumnInfo` (plugin-sdk). `FfiColumnInfo` at `plugin-sdk/src/types.rs:80` also lacks enum values. Two options:
  - A) Add to `FfiColumnInfo` (ABI change, all 4 drivers need update) — **HIGH effort**
  - B) Separate IPC command `fetch_enum_values(session_id, table, column)` that queries `INFORMATION_SCHEMA.COLUMNS` directly — **LOW effort, no ABI change**
- **Fix:** Use Option B. Add separate command, no plugin-sdk change. Plan underestimates complexity if using Option A.

### Issue 3.3: Approximate row count partially exists (LOW)
- **Plan says:** Add `fetch_approximate_count` command
- **Actual:** `TableInfo` at `models/schema.rs:6-11` already has `row_count_estimate: Option<i64>`. Drivers may already populate this via `fetchTables`.
- **Fix:** Check if drivers populate this field. If yes, frontend can use it directly without new command. If not, new command still needed.

### ❌ Issue 3.4: `fetch_rows` uses hardcoded PG-style double-quote identifiers (MED)
- **Plan says nothing** about this, but `query.rs:57-60`:
  ```rust
  Some(s) => format!("\"{}\".\"{table}\"", s),
  _ => format!("\"{table}\""),
  ```
  This is wrong for MySQL (needs backticks) and MSSQL (needs brackets). `fetch_rows` should use `quote_identifier()` from `sql_quoting.rs`.
- **Fix:** Add this as a bug fix item in Phase 3 or a separate item.

---

## Phase 4: Filter & Search

### ❌ Issue 4.1: `filterStore.ts` does NOT exist (MED)
- **Plan says:** "Modify `src/stores/filterStore.ts`"
- **Actual:** No such file. Filter state managed via local `useState` in `filter-panel.tsx` (102 lines).
- **Impact:** Must create `filterStore.ts` or lift filter state to `editorStore` per-tab. Plan references a file that doesn't exist.
- **Fix:** Create new `filterStore.ts` or integrate into `editorStore` per tab.

### Issue 4.2: Filter state is local, lost on tab switch (MED)
- **Actual:** Filter conditions are `useState` in `filter-panel.tsx`. Switching tabs or unmounting loses filter state.
- **Impact:** Quick search + filter presets need persistent state per tab.
- **Fix:** Move filter state to `editorStore` per-tab model OR create `filterStore` with tab-keyed state.

### Issue 4.3: `result-toolbar.tsx` layout (LOW)
- **Verified:** `result-toolbar.tsx` exists, 81 lines, has Results/Messages tabs + Export + Query Editor buttons.
- **Impact:** Adding search bar is feasible but must not break existing flex layout.
- **Fix:** No plan change needed — implementation concern.

---

## Phase 5: Query & Structure

### ❌ Issue 5.1: `execute_query` has NO AppHandle — cannot emit events (HIGH)
- **Plan says:** "emit Tauri events during execution"
- **Actual:** `execute_query` signature at `query.rs:23-29`:
  ```rust
  pub async fn execute_query(
      session_id: String,
      sql: String,
      _params: Option<Vec<String>>,
      manager: State<'_, Mutex<ConnectionManager>>,
  ) -> Result<QueryResult, AppError>
  ```
  No `AppHandle` parameter. Cannot call `app.emit()`.
- **Fix:** Must add `app: AppHandle` parameter to `execute_query`. This also changes the frontend IPC call signature. Plan must note this breaking change.

### ❌ Issue 5.2: Create Table Wizard effort underestimated (HIGH)
- **Plan says:** 4-5d for Phase 5 (both progress events + create table wizard)
- **Actual:** `ddl_generator.rs` doesn't exist. No create table UI exists. Only a tiny `generate_create_table` in `export_formats.rs` for SQL export (5 lines, minimal). Must build:
  - Full DDL generator with per-driver syntax (AUTO_INCREMENT vs SERIAL vs IDENTITY)
  - Complete wizard UI (multi-step form)
  - New Tauri command + registration
- **Fix:** Create Table wizard alone is 3-4d. Combined with progress events → Phase 5 should be 5-7d.

### Issue 5.3: Existing `generate_create_table` in export is minimal (LOW)
- **Verified:** `export_formats.rs:99-119` has a `generate_create_table` that only handles column name + type. No PK, no nullable, no defaults, no auto-increment.
- **Impact:** Cannot reuse for wizard — need full DDL generator.
- **Fix:** Plan correctly specifies new `ddl_generator.rs`.

---

## Phase 6: Polish & Packaging

### ⚠️ Issue 6.1: MQL export without MongoDB driver is pointless (MED)
- **Plan says:** Add MQL export format
- **Actual:** No MongoDB driver exists on Windows. MQL export generates `db.collection.insertMany()` syntax which is only useful for MongoDB.
- **Fix:** **Drop MQL export from P2.** Add it when MongoDB driver is implemented in future.

### Issue 6.2: Preview tabs — sidebar currently uses single-click for table, double-click for structure (MED)
- **Verified:** `sidebar-table-node.tsx` has `onClick` → `onOpenTable` (data grid), `onDoubleClick` → `onViewStructure` (schema view).
- **Impact:** Plan says "single-click = preview, double-click = permanent" — this conflicts with existing behavior where double-click opens structure view.
- **Fix:** Rethink preview tabs: single-click = preview (existing behavior stays), the "permanence" comes from editing. OR: single-click stays same, Ctrl+click = permanent. Plan needs revision.

### Issue 6.3: `EditorTab` model needs `isPreview` (LOW)
- **Verified:** `EditorTab` interface has `id`, `title`, `content`, `isDirty`. No `isPreview`.
- **Impact:** Must add field + update persist middleware.
- **Fix:** Plan is correct about what needs to change.

---

## Corrected Plan Diffs

### Must-fix before implementation:

1. **Phase 3B (ENUM):** Reference `models/query.rs` not `models/schema.rs`. Use separate IPC command instead of ABI change.
2. **Phase 4 (Filter):** Create `filterStore.ts` or integrate into `editorStore`. Remove reference to non-existent file.
3. **Phase 5A (Progress):** Add `app: AppHandle` param to `execute_query`. Note frontend IPC change.
4. **Phase 5B (Create Table):** Increase effort to 3-4d standalone. Phase 5 total → 5-7d.
5. **Phase 6B (MQL):** Drop from P2. No MongoDB driver to use it with.
6. **Phase 6C (Preview Tabs):** Revise behavior to not conflict with existing double-click → structure view.

### Nice-to-fix:

7. **Phase 3 (Grid):** Add `fetch_rows` identifier quoting fix (currently hardcoded PG `"quotes"`).
8. **Phase 3C (Approx Count):** Check if `TableInfo.row_count_estimate` is already populated by drivers.

---

## Revised Effort Estimates

| Phase | Original | Revised | Delta | Reason |
|-------|----------|---------|-------|--------|
| Phase 1 (Updater) | 2-3d | 2-3d | — | No change |
| Phase 2 (Connection) | 3-4d | 3-4d | — | No change |
| Phase 3 (Grid) | 3-4d | 4-5d | +1d | ENUM picker needs separate command, not ABI change |
| Phase 4 (Filter) | 2-3d | 3-4d | +1d | Need to create filterStore + per-tab state |
| Phase 5 (Query/Structure) | 4-5d | 5-7d | +1-2d | Create Table wizard underestimated |
| Phase 6 (Polish) | 3-4d | 2-3d | -1d | MQL dropped |
| **Total (parallel)** | **10-14d** | **11-16d** | **+1-2d** |

---

## Verdict: PLAN APPROVED WITH 6 CORRECTIONS

Plan is solid overall. 6 corrections needed (listed above). No fundamental architecture changes required. Ready to implement after corrections applied.
