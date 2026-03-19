# P0 Implementation Plan — Windows First Release

> Date: 2026-03-14
> Status: ✅ ALL COMPLETE — All 6 P0 features implemented and verified (tsc + cargo clippy pass).
> Scope: 6 P0 features needed for first usable Windows release
> Validation: See `p0-validation-report.md` for detailed code-verified review

---

## Problem Statement

Windows port is at ~55% parity. 6 features are critical blockers for a usable first release. They need to be planned, sequenced, and parallelized where possible.

## P0 Features

| # | Feature | Effort | Dependencies |
|---|---------|--------|-------------|
| P0-1 | SQLite driver | M (2-3d) | None — standalone cdylib |
| P0-2 | Query History backend | M (2-3d) | None — new Rust module |
| P0-3 | Tab state persistence | S (1-2d) | None — Zustand + JSON file |
| P0-4 | Filter panel (WHERE builder) | L (3-4d) | None — new React component + IPC |
| P0-5 | Right sidebar / Inspector | M (2-3d) | None — new React component |
| P0-6 | Save changes end-to-end fix | S (0.5-1d) | None — wire existing code |

---

## Architecture Decisions

### P0-1: SQLite Driver (`driver-sqlite`)

**Approach:** New `driver-sqlite` cdylib crate using `rusqlite` (bundled).

**Why `rusqlite` with bundled SQLite:**
- No external DLL dependency — SQLite compiled into the driver DLL
- Full FTS5 support (needed for history search later too)
- `rusqlite` is the de-facto Rust SQLite crate (3K+ stars, active)
- Synchronous API wrapped in `tokio::task::spawn_blocking`

**Structure:**
```
src-tauri/driver-sqlite/
├── Cargo.toml          # cdylib, depends on rusqlite + plugin-sdk
├── src/
│   ├── lib.rs          # FFI vtable export
│   ├── driver.rs       # SQLiteDriver struct implementing connect/execute/etc
│   ├── schema.rs       # fetch_tables/columns/indexes/fks/ddl
│   └── ffi.rs          # C ABI wrappers
```

**Connection config:** Reuse `DriverConfig.database` field for file path (no schema change needed). Frontend sets `database = "/path/to/file.db"`. Matches macOS pattern.

**Key differences from other drivers:**
- File-based connection (path instead of host:port)
- No user/password auth
- `PRAGMA` queries for schema introspection (not INFORMATION_SCHEMA)
- No native cancel (use `sqlite3_interrupt`)
- ConnectionForm needs conditional field rendering (hide host/port/user/password for sqlite, show file path picker via `@tauri-apps/plugin-dialog` `open()`)

**Workspace setup:** Add `"driver-sqlite"` to workspace `members` in `src-tauri/Cargo.toml`.

**Reference:** `Plugins/SQLiteDriverPlugin/SQLitePlugin.swift` — single file, ~500 lines. Uses PRAGMAs for all schema introspection.

**Edge cases:**
- File path with spaces/Unicode
- Read-only databases
- WAL mode handling
- File not found vs. create new

---

### P0-2: Query History Backend

**Approach:** New `storage/history_store.rs` Rust module using `rusqlite` with FTS5.

**Host dependency:** Add `rusqlite` to **host app** `Cargo.toml` (not a plugin):
```toml
rusqlite = { version = "0.32", features = ["bundled", "fts5"] }
```

**Why Rust-side (not frontend-only):**
- SQLite FTS5 for proper full-text search
- Persistent across app restarts
- Shared across all tabs/connections
- Frontend already has UI (`HistoryPanel.tsx`) and store (`history.ts`) calling IPC commands — just need backend

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    database TEXT,
    execution_time_ms INTEGER NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(query, content=history, content_rowid=id);
```

**Commands to register (4 new Tauri commands):**
- `history_fetch_recent` → SELECT … ORDER BY id DESC LIMIT 100
- `history_search` → FTS5 MATCH query
- `history_clear_all` → DELETE FROM history
- `history_delete_entry` → DELETE WHERE id = ?

**⚠️ IMPORTANT:** Frontend `stores/history.ts` uses colon-separated names (`history:fetch_recent` etc.) — these are **invalid** Rust identifiers. Must rename all frontend `invoke()` calls to underscore format: `history_fetch_recent`, `history_search`, `history_clear_all`, `history_delete_entry`.

**Auto-record:** Hook into `execute_query` command — after successful execution, insert into history. Frontend already calls `fetchRecent()` on panel open.

**Storage location:** `%APPDATA%/TablePro/history.sqlite3`

**Reference:** `TablePro/Core/Storage/QueryHistoryStorage.swift` — 584 lines, SQLite FTS5, cleanup throttling.

---

### P0-3: Tab State Persistence

**Approach:** Zustand `persist` middleware writing to `localStorage` (zero new dependencies).

**Why localStorage (not tauri-plugin-fs):**
- `tauri-plugin-fs` is NOT in the project — adding it requires Rust plugin + npm package + capability permissions
- `localStorage` works out of the box in Tauri WebView
- Zustand `persist` middleware supports `localStorage` natively — zero config
- 5-10MB limit per origin is sufficient (100KB cap per tab × 50-100 tabs)
- Can migrate to file-based later if needed

**Implementation:**
1. Add Zustand `persist` middleware to `editorStore.ts`
2. Save: tabs array + activeTabId + per-tab content/title
3. Restore: on app launch, Zustand auto-rehydrates from localStorage

**What to persist per tab:**
```typescript
{
  id: string;
  title: string;
  content: string; // SQL text
  tableName?: string; // if viewing a table
  schema?: string;
}
```

**Edge cases:**
- Corrupt JSON → fallback to empty state
- Large SQL content → cap at 100KB per tab
- Migration when schema changes

---

### P0-4: Filter Panel (WHERE Clause Builder)

**Approach:** New `FilterPanel` React component rendering filter rows, generating WHERE clauses client-side, appending to fetch queries.

**Architecture:**
```
src/components/filter/
├── filter-panel.tsx      # Main panel with add/remove/apply
├── filter-row.tsx        # Single filter condition row
├── quick-search.tsx      # Simple text search across all columns
└── filter-types.ts       # FilterCondition type definitions
```

**Filter model:**
```typescript
interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator; // =, !=, >, <, >=, <=, LIKE, NOT LIKE, IS NULL, IS NOT NULL, IN, BETWEEN
  value: string;
  enabled: boolean;
}
type FilterLogic = 'AND' | 'OR';
```

**How it works:**
1. User adds filter rows in UI (column dropdown, operator, value input)
2. Client generates WHERE clause string
3. Append WHERE clause to `fetch_rows` query (modify the Rust command or pass filter param)
4. Quick search: generates `col1 LIKE '%term%' OR col2 LIKE '%term%' ...`

**Option A — Client-generated WHERE (simpler):**
- Frontend builds WHERE string, sends alongside table name
- Rust `fetch_rows` accepts optional `where_clause: Option<String>` param
- ⚠️ SQL injection risk if not careful — must escape values

**Option B — Structured filter param (safer):**
- Frontend sends structured `Vec<FilterCondition>` to Rust
- Rust generates parameterized WHERE clause
- ✅ Safer, but more IPC surface

**Recommendation: Option A** with client-side escaping. Simpler, matches macOS pattern (where filters are applied as SQL WHERE). Add escaping util.

**Rust-side safety:** Add a sanity check in `fetch_rows` that rejects WHERE clauses containing dangerous patterns (`;`, `--`, `DROP`, `DELETE`, `ALTER`, `TRUNCATE`). This is not bulletproof security (user has raw SQL access anyway) but prevents accidental injection from filter values with quotes. Upgrade to Option B (structured params) in P1 if needed.

**Reference:** `TablePro/Views/Filter/FilterPanelView.swift` — 308 lines. Filter rows + quick search + AND/OR toggle + presets.

---

### P0-5: Right Sidebar / Inspector

**Approach:** New `Inspector` panel showing selected row's column-value pairs in a vertical list.

**Structure:**
```
src/components/inspector/
├── inspector-panel.tsx   # Main panel with field list
└── field-row.tsx         # Single column-value display with type-aware rendering
```

**How it works:**
1. When user selects a row in DataGrid, populate Inspector with that row's data
2. Show column name, type icon, value in a scrollable list
3. Support editing values inline (same as cell editor)
4. Resizable right panel (similar to sidebar resize pattern)

**Layout change:** `MainLayout.tsx` adds optional right panel after result area.

**State:** No new store needed — derive from `queryStore.result` + `selectedRows` + `changeStore`.

**Reference:** `TablePro/Views/RightSidebar/` — 3 files. `RightSidebarView.swift` wraps `UnifiedRightPanelView`, `EditableFieldView` renders per-field.

---

### P0-6: Save Changes End-to-End Fix

**Current state:**
- ✅ Rust `save_changes` command exists and works (tested, 30+ unit tests)
- ✅ `sql_generator` generates correct INSERT/UPDATE/DELETE
- ✅ `ChangeToolbar` with Save/Discard/Undo/Redo exists
- ❌ `result-panel.tsx` line 64: `handleSave` is `console.log('Save changes:', getChanges())`

**Fix:** Wire `handleSave` to call IPC `save_changes` with proper `SavePayload`, refresh grid after success.

**⚠️ Context plumbing needed:** `ResultPanel` currently doesn't know which table is being viewed. `tableName` + `schema` must be passed from Sidebar table selection through `MainLayout` to `ResultPanel`. Already partially exists via `structureTarget` — extend this path.

**Steps:**
1. Establish `tableName` + `schema` context flow: Sidebar → MainLayout → ResultPanel
2. Build `SavePayload` from changeStore data + queryStore result (columns, PKs, table name)
3. Call `invoke('save_changes', { sessionId, payload })`
4. On success: clear change store, re-execute query to refresh grid
5. On error: show error message, keep changes

**Effort:** 0.5-1 day. Mostly wiring, no new architecture.

---

## Sequencing & Parallelization

```
Week 1 (parallel, 3 agents):
├── DEV-A: P0-1 SQLite driver (Rust only, no MainLayout touch)
├── DEV-B: P0-2 Query History backend (Rust + fix frontend invoke names in history.ts)
└── DEV-C: P0-6 Save changes fix + P0-3 Tab persistence (Frontend only)

Week 2 (sequential, single agent for MainLayout safety):
├── P0-4 Filter panel (Frontend + Rust query.rs + MainLayout)
└── P0-5 Inspector panel (Frontend + MainLayout) — AFTER P0-4
```

**Why P0-4 and P0-5 are sequential (not parallel):** Both modify `MainLayout.tsx` for layout changes. Running them in parallel would cause merge conflicts. P0-4 goes first, P0-5 builds on the updated layout.

**Parallelization map:**
- P0-1, P0-2 are fully independent Rust work → run in parallel
- P0-6 + P0-3 are independent frontend work → run in parallel with Rust tasks
- P0-4 and P0-5 both touch `MainLayout.tsx` → must be sequential
- P0-4 touches `fetch_rows` Rust command → run after P0-1 completion

**File ownership boundaries (for parallel agents):**

| Task | Rust files | Frontend files |
|------|-----------|----------------|
| P0-1 | `driver-sqlite/**`, `Cargo.toml` workspace | `ConnectionForm.tsx` (dbType list) |
| P0-2 | `storage/history_store.rs`, `commands/history.rs`, `lib.rs` (register) | — (frontend already done) |
| P0-3 | — | `stores/editorStore.ts` |
| P0-4 | `commands/query.rs` (add where_clause param) | `components/filter/**` (new), `MainLayout.tsx` |
| P0-5 | — | `components/inspector/**` (new), `MainLayout.tsx` (AFTER P0-4) |
| P0-6 | — | `components/grid/result-panel.tsx`, `MainLayout.tsx` (context plumbing) |

No file conflicts between parallel tasks.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `rusqlite` build issues on Windows | High | Use `bundled` feature; test early |
| Filter SQL injection | Medium | Client-side escaping + parameterized queries |
| Tab persistence corrupt data | Low | Validate JSON, fallback to empty |
| History DB locking under concurrent use | Low | WAL mode + single writer |
| Inspector perf with large rows (100+ columns) | Low | Virtualize field list |

---

## Success Criteria

- [x] SQLite: connect to `.sqlite3` file, run queries, browse tables/columns/indexes
- [x] History: run query → appears in history panel, search works, clear works
- [x] Tab persistence: close app, reopen → tabs restored with content
- [x] Filter: add filter row → grid shows filtered results, quick search works
- [x] Inspector: select row → right panel shows column-value pairs
- [x] Save: edit cell → save → data persisted to DB, grid refreshes

---

## Total Estimated Effort (Revised)

| Feature | Effort |
|---------|--------|
| P0-1 SQLite driver | 2-3 days |
| P0-2 Query History | 1.5-2 days |
| P0-3 Tab persistence | 0.5-1 day |
| P0-4 Filter panel | 3-4 days |
| P0-5 Inspector | 2-3 days |
| P0-6 Save changes fix | 1-1.5 days |
| **Total (sequential)** | **~10-14.5 days** |
| **Total (3 parallel agents)** | **~4-6 days** |
