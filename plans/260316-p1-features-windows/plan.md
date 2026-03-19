---
status: complete
created: 2026-03-16
scope: P1 features for Windows port feature parity
---

# P1 Implementation Plan — Windows Feature Parity

> Date: 2026-03-16
> Status: complete
> Prereq: P0 complete (SQLite, History, Tab persist, Filter, Inspector, Save changes)

## Problem Statement

Windows port at ~59% parity after P0 completion. P1 closes the gap on high-value daily-use features: SSH tunneling, SQL import, XLSX export, connection groups, PostgreSQL schema switching, and quality-of-life improvements (keyboard shortcuts, safe mode levels, FK navigation, tab management).

## P1 Feature Set (10 items)

| # | Feature | Size | Risk |
|---|---------|------|------|
| P1-0 | SSH spike: validate ssh2 crate on Windows MSVC | S (1d) | — |
| P1-1 | SSH tunnel support | XL | HIGH — depends on spike |
| P1-2 | Import SQL (full-featured) | L | LOW |
| P1-3 | XLSX export | M | LOW |
| P1-4 | Connection groups (sidebar folders) | M | LOW |
| P1-5 | PostgreSQL schema switching | M | MED — vtable extension needed |
| P1-6 | Missing keyboard shortcuts + Help dialog | S | LOW |
| P1-7 | Full safe mode levels (6 levels) | M | LOW |
| P1-8 | FK navigation arrows | L | MED — grid cell rendering + query plumbing |
| P1-9 | Tab management (Ctrl+I insert, Ctrl+Tab switch) | S | LOW |

> **Note:** Ctrl+W already implemented in P0. P1-9 covers remaining: Ctrl+I, Ctrl+Tab, Ctrl+Shift+Tab.

---

## Phases

| Phase | Features | Est. Effort | Parallel? | Status |
|-------|----------|-------------|-----------|--------|
| Phase 0 | P1-0 SSH spike (validate ssh2 on MSVC) → **russh** selected | 1d | Single agent | ✅ Complete |
| Phase 1 | P1-3 XLSX, P1-6 Shortcuts+Help, P1-9 Tab mgmt | 3-4d | Yes (3 agents) | ✅ Complete |
| Phase 2 | P1-4 Connection groups, P1-7 Safe mode | 4-5d | Yes (2 agents) | ✅ Complete |
| Phase 3 | P1-5 Schema switching, P1-8 FK navigation | 4-5d | Yes (2 agents) | ✅ Complete |
| Phase 4 | P1-2 Import SQL | 4-5d | Single agent | ✅ Complete |
| Phase 5 | P1-1 SSH tunnel | 4-6d | Single agent (de-risked by Phase 0) | ✅ Complete |

**Total sequential: ~20-26 days**
**Total with parallel agents: ~11-15 days**

**Phase 0 runs before everything else.** If ssh2 spike fails → switch to `russh`, re-estimate Phase 5.

---

## Phase Details

→ `phase-00-ssh-spike.md` — SSH spike: validate ssh2 on Windows MSVC
→ `phase-01-quick-wins.md` — XLSX export, keyboard shortcuts + help dialog, tab management
→ `phase-02-connection-groups-safemode.md` — Connection groups, full safe mode
→ `phase-03-schema-fk.md` — Schema switching, FK navigation
→ `phase-04-import-sql.md` — Full-featured SQL import
→ `phase-05-ssh-tunnel.md` — SSH tunnel via ssh2 crate

---

## Key Architecture Decisions

### SSH Tunnel (P1-1): `russh` crate (pure Rust — updated after spike)
- Pure Rust, no C deps — no Perl/OpenSSL needed on CI/CD
- Async-native — integrates with Tauri's tokio runtime (no spawn_blocking)
- 16x faster build than ssh2 (21s vs 344s)
- Supports password, key file auth + channel_open_direct_tcpip

### XLSX Export (P1-3): `rust_xlsxwriter` crate
- Pure Rust, no C deps
- Good perf, supports formatting, multiple sheets
- Row-by-row streaming (low memory for large exports)

### Connection Groups (P1-4): JSON storage extension
- Extend `ConnectionStore` with `groups: Vec<ConnectionGroup>`
- `ConnectionGroup { id, name, color, collapsed, order }`
- `SavedConnection` gains optional `group_id: Option<String>`
- Frontend sidebar renders grouped sections with chevron collapse

### Schema Switching (P1-5): No vtable change needed
- PostgreSQL driver already returns `table_schema` in `fetch_tables`
- Add `fetch_schemas` as new vtable entry OR use `execute("SELECT schema_name FROM information_schema.schemata")`
- Prefer `execute` approach — no plugin-sdk breaking change
- Frontend: Ctrl+K switcher shows schemas below databases
- On schema select: set `currentSchema` in state, pass to `fetch_rows`/`fetch_tables`

### FK Navigation (P1-8): Grid cell overlay
- `fetch_foreign_keys` already returns FK metadata per table
- Store FK map in `schemaStore` keyed by table+column
- Grid renders small arrow icon in FK column cells
- Click arrow → open new tab with referenced table filtered by FK value

### Import SQL (P1-2): Full macOS parity
- File picker (`.sql`, `.sql.gz`)
- Preview: file contents, statement count, file size
- Options: wrap in transaction, disable FK checks
- Rust backend: statement scanner, sequential execution with progress events
- Progress: Tauri events for `import_progress` (statement N/total)
- `.gz` support via `flate2` crate

### Safe Mode Levels (P1-7): 6 levels
- Silent → Alert → Alert Full → Safe Mode → Safe Mode Full → Read-Only
- Replace boolean `safeMode` with `safeModeLevel: number` (0-5)
- No migration needed — app has no public release yet, only test builds
- Dangerous query detection: regex-based SQL scan (existing pattern in macOS)
- Confirmation dialog before destructive queries at levels 1-4
- Read-Only (level 5): block all INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE

### Keyboard Shortcuts Help (P1-6): Help dialog
- `Ctrl+?` or `F1` opens shortcuts help dialog/overlay
- Lists all available shortcuts grouped by category
- Searchable or sectioned: Editor, Grid, Navigation, General
- Overlay dismisses on Esc or click outside

### Import SQL Shortcut: `Ctrl+Shift+M` (iMport)
- `Ctrl+Shift+I` already taken by Inspector toggle
- macOS uses `Cmd+Shift+I` for import — Windows remaps to `Ctrl+Shift+M`
- Alternatively accessible via toolbar Import button

---

## Risk Assessment

| Risk | Impact | Prob | Mitigation |
|------|--------|------|-----------|
| ssh2 build fails on Windows MSVC | HIGH | MED | Spike first; fallback to `russh` if needed |
| ssh2 doesn't support agent forwarding on Windows | MED | MED | SSH agent is P2; password + key file sufficient for P1 |
| vtable extension for fetch_schemas breaks ABI | HIGH | LOW | Avoided — use execute() instead |
| Large XLSX export OOM | MED | LOW | rust_xlsxwriter streams rows, no full buffer |
| Import .gz decompression perf | LOW | LOW | flate2 streaming, read chunk by chunk |
| Connection group drag-drop complexity | MED | MED | Defer drag-drop to P2; use dropdown assignment |

---

## File Ownership Map (Parallel Safety)

| Feature | Rust files | Frontend files |
|---------|-----------|----------------|
| P1-1 SSH | `services/ssh_tunnel.rs` (new), `commands/connection.rs`, `models/connection.rs` | `components/connection/ConnectionForm.tsx` (SSH tab) |
| P1-2 Import | `commands/import.rs` (new), `services/import_service.rs` (new) | `components/import/` (new dir) |
| P1-3 XLSX | `commands/export.rs` | None (existing export dialog) |
| P1-4 Groups | `storage/connection_store.rs`, `commands/storage.rs` | `components/connection/` (WelcomeView, ConnectionList) |
| P1-5 Schema | `commands/schema.rs` | `stores/schemaStore.ts`, `components/layout/Sidebar.tsx`, `QuickSwitcher.tsx` |
| P1-6 Shortcuts | None | `hooks/useKeyboardShortcuts.ts`, `components/shared/ShortcutsHelp.tsx` (new) |
| P1-7 Safe mode | `commands/query.rs` (optional) | `stores/settingsStore.ts`, `components/settings/`, `Toolbar.tsx` |
| P1-8 FK nav | None | `components/grid/`, `stores/schemaStore.ts` |
| P1-9 Tab mgmt | None | `hooks/useKeyboardShortcuts.ts`, `stores/editorStore.ts` |

**Conflicts:** P1-6 and P1-9 both touch `useKeyboardShortcuts.ts` → combine into single task.

---

## Keyboard Shortcuts Reference (complete after P1)

### Editor
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Run query |
| `Ctrl+Shift+Enter` | Run all statements |
| `Ctrl+Shift+F` | Format SQL |
| `Ctrl+/` | Toggle line comment |
| `Ctrl+D` | Select next occurrence |

### Tabs
| Shortcut | Action |
|----------|--------|
| `Ctrl+N` or `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |

### Data Grid
| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save changes |
| `Ctrl+I` | Insert new row |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

### Navigation
| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Quick switcher (tables/schemas/databases) |
| `Ctrl+Shift+E` | Toggle sidebar |
| `Ctrl+Shift+I` | Toggle inspector |
| `Ctrl+H` | Toggle history panel |

### General
| Shortcut | Action |
|----------|--------|
| `Ctrl+,` | Open settings |
| `Ctrl+Shift+M` | Import SQL |
| `F5` | Refresh schema |
| `F1` or `Ctrl+?` | Keyboard shortcuts help |
| `Escape` | Cancel query / dismiss dialog |

---

## Dependencies

```
P1-3 (XLSX) ← no deps
P1-6+P1-9 (Shortcuts + Tab mgmt) ← no deps
P1-4 (Groups) ← no deps
P1-7 (Safe mode) ← no deps
P1-5 (Schema) ← no deps
P1-8 (FK nav) ← depends on schemaStore FK data (already exists from P0)
P1-2 (Import) ← no deps
P1-1 (SSH) ← no deps (but high risk → schedule last)
```

---

## Success Criteria

- [x] SSH: connect via SSH tunnel with password + key file, tunnel auto-reconnects
- [x] Import SQL: pick .sql/.sql.gz, preview, execute with progress, transaction wrap works
- [x] XLSX: export table/query results to .xlsx with proper column types
- [x] Groups: create/rename/delete groups, assign connections, collapse/expand
- [x] Schema: Ctrl+K lists PostgreSQL schemas, switching filters sidebar tables
- [x] Shortcuts: Ctrl+I inserts row, Ctrl+Tab switches tabs, F1 shows help overlay
- [x] Safe mode: 6 levels work, confirmation dialog at appropriate levels
- [x] FK nav: arrow icon in FK cells, click opens referenced table with filter
- [x] Tab mgmt: Ctrl+Tab, Ctrl+Shift+Tab functional (Ctrl+W already done in P0)
- [x] Help: F1/Ctrl+? opens shortcuts help dialog with all shortcuts listed
