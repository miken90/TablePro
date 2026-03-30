# P0 Plan Validation Report

> Date: 2026-03-14
> Reviewer: Code-verified validation against actual codebase

---

## Validation Summary

| Item | Plan Claim | Verified | Issues Found |
|------|-----------|----------|-------------|
| P0-1 SQLite | rusqlite cdylib | ✅ Feasible | 3 issues |
| P0-2 History | rusqlite FTS5 in Rust | ✅ Feasible | 2 issues |
| P0-3 Tab persist | Zustand persist + tauri-plugin-fs | ⚠️ Needs adjustment | 2 issues |
| P0-4 Filter | Client-side WHERE (Option A) | ❌ Reconsider | 1 critical issue |
| P0-5 Inspector | New React component | ✅ Feasible | 1 issue |
| P0-6 Save fix | Wire handleSave | ✅ Feasible | 2 issues |

---

## P0-1: SQLite Driver — 3 Issues

### Issue 1: `DriverConfig` only has `host/port/user/password/database/ssl_mode`

**Problem:** `DriverConfig` (plugin-sdk `types.rs:189-196`) has no `file_path` field. SQLite cần đường dẫn file, không phải host:port.

**Current struct:**
```rust
pub struct DriverConfig {
    pub host: FfiStr,
    pub port: u16,
    pub user: FfiStr,
    pub password: FfiStr,
    pub database: FfiStr,
    pub ssl_mode: FfiStr,
}
```

**Options:**
- **A. Reuse `database` field for file path** — SQLite driver reads `config.database` as file path. Frontend sets `database = "/path/to/file.db"`. No SDK change needed.
- **B. Reuse `host` field** — Less semantic but also works.
- **C. Add `file_path` to DriverConfig** — Breaking change, all drivers need update.

**Recommendation: Option A.** Reuse `database` field. macOS reference does similar — SQLite connection uses database field for path. Zero breaking changes.

### Issue 2: ConnectionForm frontend — `database` field needs to become file picker for sqlite

**Problem:** Plan mentions "conditional field rendering" but doesn't detail: when dbType is `sqlite`, hide host/port/user/password fields, show a file open dialog button instead.

**Fix:** Need `@tauri-apps/plugin-dialog` (already in deps) `open()` call for `.sqlite`/`.db` file selection. Store result in `config.database`.

### Issue 3: Workspace member registration

**Problem:** `Cargo.toml` line 2 needs `driver-sqlite` added to workspace members.
```toml
members = [".", "plugin-sdk", "driver-postgres", "driver-mysql", "driver-mssql"]
```
Plan doesn't mention this explicitly — must add `"driver-sqlite"` to the list.

**Severity: Low** — obvious step but easy to forget.

---

## P0-2: Query History — 2 Issues

### Issue 1: `rusqlite` as host-app dependency (not plugin)

**Problem:** Plan says "new `storage/history_store.rs` using `rusqlite`" but the host app (`tablepro-windows` crate) doesn't currently depend on `rusqlite`. It needs to be added to the **host** `Cargo.toml`, not a plugin crate.

**Fix:** Add to `src-tauri/Cargo.toml`:
```toml
rusqlite = { version = "0.32", features = ["bundled", "fts5"] }
```

**Risk:** `bundled` feature compiles SQLite from C source. On Windows this requires a C compiler (MSVC, which Tauri already requires). Should be fine but adds ~30s compile time.

### Issue 2: Command name mismatch — colons not valid in Tauri command names

**Problem:** Frontend `history.ts` calls `invoke("history:fetch_recent")` (line 32), `invoke("history:search")` (line 41), etc. But **Tauri command names are Rust function names** — colons are not valid in Rust identifiers.

**Current frontend IPC calls:**
```typescript
invoke<HistoryEntry[]>("history:fetch_recent")
invoke<HistoryEntry[]>("history:search", { query })
invoke("history:clear_all")
invoke("history:delete_entry", { id })
```

**Fix:** Either:
- A. Rename frontend calls to `history_fetch_recent`, `history_search`, etc. (match Rust fn names)
- B. Use `#[tauri::command(rename_all = "...")]` — but Tauri doesn't support arbitrary rename with colons

**Recommendation: Option A.** Rename frontend `invoke()` calls. Must update `stores/history.ts`.

---

## P0-3: Tab Persistence — 2 Issues

### Issue 1: `tauri-plugin-fs` not in project

**Problem:** Plan assumes `tauri-plugin-fs` is available. It's **not** in `Cargo.toml` dependencies or `package.json`.

**Fix options:**
- **A. Add `tauri-plugin-fs`** — Requires adding Rust plugin + npm package + capability permissions + rebuild.
- **B. Use existing IPC** — Add 2 Rust commands (`load_tab_state`/`save_tab_state`) that read/write JSON via `std::fs`. Simpler, no new Tauri plugin.
- **C. Use `localStorage`** — Zustand persist to `localStorage` works out of the box in Tauri WebView. No Rust change needed. Data stored in WebView's storage.

**Recommendation: Option C for MVP.** `localStorage` is simplest, zero new dependencies. Zustand `persist` middleware supports it natively. Migrate to file-based later if needed.

**Caveat:** `localStorage` has 5-10MB limit per origin. With 100KB cap per tab (plan's own suggestion), supports ~50-100 tabs. Sufficient for MVP.

### Issue 2: `tauri-plugin-fs` capability permissions missing

If using Option A, `capabilities/default.json` needs fs permissions:
```json
"fs:default",
"fs:allow-app-data-dir-access"
```
Not an issue if using Option C (localStorage).

---

## P0-4: Filter Panel — 1 CRITICAL Issue

### ❌ CRITICAL: Option A (client-side WHERE string) is SQL injection risk

**Problem:** Plan recommends "Option A with client-side escaping." This is fundamentally flawed:
1. Client-side escaping is never reliable — user controls the JavaScript runtime
2. Frontend sends raw WHERE clause string to Rust `fetch_rows` which concatenates it into SQL
3. Malicious or buggy input → SQL injection (DROP TABLE, data exfiltration)

**Plan's own note:** "⚠️ SQL injection risk if not careful — must escape values"

**However:** This is an internal desktop app, not a web app. The "attacker" is the user themselves who already has direct SQL access via the editor. The risk is accidental injection from filter values containing quotes, not malicious attack.

**Revised recommendation: Still use Option A but with proper escaping.**
- Rust-side: validate the WHERE clause doesn't contain dangerous patterns (`;`, `--`, `DROP`, `DELETE` etc.) — simple sanity check
- OR: Use Rust-side `fetch_rows` that accepts structured params and builds parameterized queries

**Final verdict: Option A is acceptable for P0** given this is a local desktop app where user already has raw SQL access. Add basic Rust-side sanity check. Upgrade to Option B in P1 if needed.

---

## P0-5: Inspector — 1 Issue

### Issue 1: `MainLayout.tsx` is already 150+ lines, adding Inspector panel adds complexity

**Problem:** `MainLayout.tsx` manages sidebar, editor, results, quick switcher, structure view, settings. Adding Inspector panel (resizable right panel) increases complexity.

**Fix:** Extract the Inspector as a self-contained component that receives selected row data as props. Keep the resize handle logic within `MainLayout` but minimal — similar pattern to existing sidebar resize.

**Not blocking.** Just a code organization concern.

---

## P0-6: Save Changes Fix — 2 Issues

### Issue 1: Missing context — where does `tableName` and `primaryKeys` come from?

**Problem:** `SavePayload` requires `table`, `schema`, `columns`, `primaryKeys`. Plan says "Build SavePayload from changeStore data + queryStore result" but:
- `queryStore` has `result: QueryResult` which has `columns: ColumnInfo[]` → ✅ has column names
- `queryStore` has `queryText` → can extract table name from SQL parse
- `ColumnInfo` has `isPrimaryKey: boolean` → ✅ can derive PKs
- **BUT:** if user ran a raw `SELECT` query (not table browse), there's no table name

**Fix:** `handleSave` should only be enabled when viewing a table (not raw query results). Need `tableName` state in `ResultPanel` or passed from parent.

**Currently:** `ResultPanel` doesn't know what table is being viewed. The `Sidebar` knows (it triggered the table open), but that context isn't passed to ResultPanel.

**This is the real fix needed:** Pass `tableName` + `schema` from sidebar table selection through to `ResultPanel`. Already partially exists in `MainLayout` with `structureTarget`.

### Issue 2: Missing `schema` field in `fetchRows` frontend call

**Problem:** `commands.ts:25-26`:
```typescript
export const fetchRows = (sessionId: string, table: string, offset: number, limit: number)
```
No `schema` parameter in frontend `fetchRows` call, but Rust `fetch_rows` accepts `schema: Option<String>`.

**Not blocking for P0-6** but will cause issues for PostgreSQL multi-schema setups.

---

## File Ownership Conflicts — VERIFIED SAFE

| Conflict Check | Result |
|---------------|--------|
| P0-2 (lib.rs register) vs P0-4 (query.rs param) | ✅ Different files |
| P0-3 (editorStore.ts) vs P0-6 (result-panel.tsx) | ✅ Different files |
| P0-5 (MainLayout.tsx) vs P0-4 (filter in MainLayout?) | ⚠️ Both may touch `MainLayout.tsx` |

**Fix for P0-4/P0-5 conflict:** P0-4 Filter panel will likely need to be placed in `MainLayout.tsx` layout. P0-5 Inspector also modifies `MainLayout.tsx`. Schedule P0-4 and P0-5 sequentially, not parallel, OR have one agent handle both layout changes.

---

## Corrected Sequencing

Original plan had P0-4 and P0-5 parallel in Week 2. Due to `MainLayout.tsx` conflict:

```
Week 1 (parallel, 3 agents):
├── DEV-A: P0-1 SQLite driver (Rust only, no MainLayout touch)
├── DEV-B: P0-2 Query History backend (Rust + fix frontend invoke names)
└── DEV-C: P0-6 Save changes fix + P0-3 Tab persistence (Frontend)

Week 2 (sequential, 1-2 agents):
├── DEV-A: P0-4 Filter panel (Frontend + Rust query.rs + MainLayout)
└── DEV-A: P0-5 Inspector panel (Frontend + MainLayout) — AFTER P0-4
```

**Alternative:** P0-4 and P0-5 can still parallel IF Inspector is placed in a separate resizable area (not inside MainLayout filter section). But safer to sequence.

---

## Corrected Plan Diffs

### Must-fix before implementation:

1. **P0-1:** Use `database` field for file path, no DriverConfig change
2. **P0-2:** Add `rusqlite` to host `Cargo.toml`, rename `history:*` → `history_*` in `stores/history.ts`
3. **P0-3:** Use `localStorage` via Zustand `persist` (no `tauri-plugin-fs` needed)
4. **P0-4:** Keep Option A but add Rust-side sanity check on WHERE clause
5. **P0-5/P0-4:** Sequence these two (MainLayout conflict)
6. **P0-6:** Establish `tableName`/`schema` context flow from Sidebar → ResultPanel

### Nice-to-fix:

7. `fetchRows` frontend should pass `schema` parameter
8. Tauri commands audit — ensure all new commands have `#[serde(rename_all = "camelCase")]` on request types

---

## Revised Effort Estimate

| Feature | Original | Revised | Delta | Reason |
|---------|----------|---------|-------|--------|
| P0-1 SQLite | 2-3d | 2-3d | — | No change |
| P0-2 History | 2-3d | 1.5-2d | -0.5d | Simpler than estimated (no FTS complexity for MVP) |
| P0-3 Tab persist | 1-2d | 0.5-1d | -0.5d | localStorage much simpler than tauri-plugin-fs |
| P0-4 Filter | 3-4d | 3-4d | — | No change |
| P0-5 Inspector | 2-3d | 2-3d | — | No change |
| P0-6 Save fix | 0.5-1d | 1-1.5d | +0.5d | Need tableName context plumbing |
| **Total (parallel)** | **5-7d** | **4-6d** | **-1d** | |

---

## Verdict: PLAN APPROVED WITH CORRECTIONS

Plan is solid. 6 corrections needed (listed above). No fundamental architecture changes required. Ready to implement after corrections are applied.
