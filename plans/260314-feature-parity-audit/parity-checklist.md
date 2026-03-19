# Feature Parity Checklist: macOS → Windows

> Generated: 2026-03-14
> Purpose: Track what has been ported, what's partial, and what's missing.
> Legend: ✅ Done | 🔶 Partial | ❌ Missing | ➖ N/A (Windows doesn't need)

---

## 1. Database Drivers

| Driver | macOS (Swift Plugin) | Windows (Rust DLL) | Status | Notes |
|--------|---------------------|-------------------|--------|-------|
| PostgreSQL | `PostgreSQLDriverPlugin/` | `driver-postgres/` | ✅ Done | tokio-postgres + native-tls |
| MySQL | `MySQLDriverPlugin/` | `driver-mysql/` | ✅ Done | mysql_async |
| MSSQL | `MSSQLDriverPlugin/` | `driver-mssql/` | ✅ Done | tiberius |
| SQLite | `SQLiteDriverPlugin/` | — | ❌ Missing | UI lists "sqlite" in ConnectionForm but no driver crate |
| MongoDB | `MongoDBDriverPlugin/` | — | ❌ Missing | NoSQL driver with key-value browsing |
| Redis | `RedisDriverPlugin/` | — | ❌ Missing | Key-value browsing, TTL, CLI |
| Oracle | `OracleDriverPlugin/` | — | ❌ Missing | OCI-based driver |
| ClickHouse | `ClickHouseDriverPlugin/` | — | ❌ Missing | HTTP-based, query progress |
| DuckDB | `DuckDBDriverPlugin/` | — | ❌ Missing | File-based, CSV/Parquet query |
| Redshift | (via PostgreSQL variant) | — | ❌ Missing | PostgreSQL wire protocol variant |

**Summary: 3/10 drivers ported**

---

## 2. Core Workflows

### Connection Management

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Connect/Disconnect | ✅ | ✅ | ✅ Done | |
| Test Connection | ✅ | ✅ | ✅ Done | |
| Save/List/Delete connections | ✅ | ✅ | ✅ Done | ConnectionStore |
| Connection groups/folders | ✅ | — | ❌ Missing | GroupStorage.swift |
| Connection color/environment indicator | ✅ | — | ❌ Missing | Toolbar tint |
| Multi-window/multi-connection | ✅ | — | ❌ Missing | macOS uses native window tabs |
| Database switching (sidebar dropdown) | ✅ | ✅ | ✅ Done | switch_database command |
| Schema switching (Ctrl+K) | ✅ | — | ❌ Missing | PostgreSQL schema browsing |
| Connection URL import | ✅ | — | ❌ Missing | `mysql://`, `postgresql://` |
| Connection tags/environment labels | ✅ | — | ❌ Missing | |
| Startup commands (run SQL after connect) | ✅ | — | ❌ Missing | Advanced tab |
| Pre-connect script | ✅ | — | ❌ Missing | Shell command before connect |

### Query Execution

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Execute query (single statement) | ✅ | ✅ | ✅ Done | Ctrl+Enter |
| Execute all statements | ✅ | ✅ | ✅ Done | Ctrl+Shift+Enter |
| Cancel running query | ✅ | ✅ | ✅ Done | cancel_query command |
| Fetch row count | ✅ | ✅ | ✅ Done | fetch_count command |
| Paginated row fetching | ✅ | ✅ | ✅ Done | fetch_rows with offset/limit |
| Query progress events | ✅ | — | ❌ Missing | events.ts is placeholder |
| Approximate row count (instant) | ✅ | — | ❌ Missing | DB metadata-based |

### Data Grid & CRUD

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Virtual scrolling (100K rows) | ✅ | ✅ | ✅ Done | TanStack Virtual |
| Column resize/sort | ✅ | ✅ | ✅ Done | |
| Row selection (shift/ctrl multi) | ✅ | ✅ | ✅ Done | |
| Cell editing (type-aware) | ✅ | ✅ | ✅ Done | CellEditor |
| Change tracking (undo/redo) | ✅ | ✅ | ✅ Done | Zustand changeStore |
| Save changes (INSERT/UPDATE/DELETE) | ✅ | ✅ | 🔶 Partial | save_changes IPC exists, but result-panel handleSave may have placeholder code |
| Visual change indicators | ✅ | ✅ | ✅ Done | yellow/green/red |
| Copy as INSERT/UPDATE SQL | ✅ | — | ❌ Missing | Context menu |
| FK navigation arrows | ✅ | — | ❌ Missing | Click to navigate FK |
| Inline editing (boolean/JSON/date) | ✅ | ✅ | ✅ Done | |
| ENUM/SET picker | ✅ | — | ❌ Missing | Single-click dropdown |

### SQL Editor

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Syntax highlighting (PG/MySQL/MSSQL) | ✅ | ✅ | ✅ Done | CodeMirror 6 |
| Schema-aware autocomplete | ✅ | ✅ | ✅ Done | Context-sensitive |
| Vim mode | ✅ | ✅ | ✅ Done | @replit/codemirror-vim |
| SQL formatting (Ctrl+Shift+F) | ✅ | ✅ | ✅ Done | |
| Multi-tab editor | ✅ | ✅ | ✅ Done | Per-tab state |
| Toggle comment (Ctrl+/) | ✅ | ✅ | ✅ Done | |
| Select next occurrence (Ctrl+D) | ✅ | ✅ | ✅ Done | |
| Inline AI suggestions (ghost text) | ✅ | — | ❌ Missing | InlineSuggestionManager |

---

## 3. Side Panels & Navigation

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Sidebar table list | ✅ | ✅ | ✅ Done | |
| Sidebar column expansion (type icons) | ✅ | ✅ | ✅ Done | |
| Sidebar context menu | ✅ | ✅ | 🔶 Partial | Basic context menu |
| Sidebar search/filter | ✅ | ✅ | ✅ Done | |
| Database switcher dropdown | ✅ | ✅ | ✅ Done | |
| Quick Switcher (Ctrl+K) | ✅ | ✅ | ✅ Done | Fuzzy table search |
| Right sidebar / Inspector panel | ✅ | — | ❌ Missing | Row detail pane |
| History panel | ✅ | 🔶 | 🔶 Partial | UI exists, Rust commands NOT registered |
| Filter panel (WHERE clause builder) | ✅ | — | ❌ Missing | FilterPanelView, AND/OR logic |
| Quick search (row filter bar) | ✅ | — | ❌ Missing | QuickSearchField |
| Filter presets | ✅ | — | ❌ Missing | FilterSettingsStorage |

---

## 4. Export & Import

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Export CSV | ✅ | ✅ | ✅ Done | export_to_file |
| Export JSON | ✅ | ✅ | ✅ Done | |
| Export SQL | ✅ | ✅ | ✅ Done | |
| Export XLSX | ✅ | — | ❌ Missing | Requires xlsx crate |
| Export MQL (MongoDB) | ✅ | — | ❌ Missing | MongoDB-specific |
| Export progress tracking | ✅ | ✅ | ✅ Done | |
| Import SQL | ✅ | — | ❌ Missing | ImportDialog, SQL parsing |
| Import from URL/connection string | ✅ | — | ❌ Missing | Parse connection URLs |
| Import from .tableplugin | ✅ | — | ➖ N/A | macOS plugin system |

---

## 5. Table Structure View

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Columns tab | ✅ | ✅ | ✅ Done | |
| Indexes tab | ✅ | ✅ | ✅ Done | |
| Foreign Keys tab | ✅ | ✅ | ✅ Done | |
| DDL tab | ✅ | ✅ | ✅ Done | |
| Create Table wizard | ✅ | — | ❌ Missing | |

---

## 6. Settings & Preferences

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| General settings | ✅ | ✅ | ✅ Done | |
| Editor settings (tabSize, wordWrap, vim) | ✅ | ✅ | ✅ Done | |
| Appearance (theme: light/dark/system) | ✅ | ✅ | ✅ Done | |
| Connection settings | ✅ | ✅ | ✅ Done | |
| Settings persistence (JSON) | ✅ | ✅ | ✅ Done | SettingsStore |
| Safe mode levels (6 levels) | ✅ | 🔶 | 🔶 Partial | Basic toggle, not 6 levels |
| Plugin management UI | ✅ | — | ❌ Missing | macOS-style .tableplugin |

---

## 7. Storage & Security

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| Connection storage | ✅ | ✅ | ✅ Done | JSON-based |
| Password encryption | ✅ (Keychain) | ✅ (DPAPI) | ✅ Done | Platform-appropriate |
| User preferences (JSON) | ✅ | ✅ | ✅ Done | %APPDATA% |
| Query history (SQLite FTS5) | ✅ | — | ❌ Missing | No Rust history module |
| Tab state persistence | ✅ | — | ❌ Missing | No tab state storage |
| Filter preset storage | ✅ | — | ❌ Missing | FilterSettingsStorage |

---

## 8. AI Features

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| AI Chat panel | ✅ | — | ❌ Missing | AIChatPanelView |
| AI inline suggestions (ghost text) | ✅ | — | ❌ Missing | InlineSuggestionManager |
| AI provider config (OpenAI/Anthropic/Gemini/Ollama) | ✅ | — | ❌ Missing | AIProviderFactory |
| Schema-aware AI context | ✅ | — | ❌ Missing | AISchemaContext |

---

## 9. SSH & Network

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| SSH tunnel | ✅ | — | ❌ Missing | SSHTunnelManager |
| SSH Agent auth (1Password, etc.) | ✅ | — | ❌ Missing | |
| Multi-hop SSH (ProxyJump) | ✅ | — | ❌ Missing | |
| SSH config parser | ✅ | — | ❌ Missing | SSHConfigParser |
| SSL/TLS options in connection form | ✅ | ✅ | 🔶 Partial | sslMode field exists, limited options |

---

## 10. Keyboard Shortcuts

| Shortcut | macOS | Windows | Status |
|----------|-------|---------|--------|
| Ctrl+Enter — Run query | ✅ | ✅ | ✅ |
| Ctrl+Shift+Enter — Run all | ✅ | ✅ | ✅ |
| Ctrl+N — New tab | ✅ | ✅ | ✅ |
| Ctrl+W — Close tab | ✅ | — | ❌ |
| Ctrl+K — Quick Switcher | ✅ | ✅ | ✅ |
| Ctrl+S — Save changes | ✅ | ✅ | ✅ |
| Ctrl+Shift+F — Format SQL | ✅ | ✅ | ✅ |
| F5 — Refresh schema | ✅ | ✅ | ✅ |
| Ctrl+, — Settings | ✅ | ✅ | ✅ |
| Ctrl+Shift+E — Export | ✅ | ✅ | ✅ |
| Ctrl+/ — Toggle comment | ✅ | ✅ | ✅ |
| Ctrl+D — Select next occurrence | ✅ | ✅ | ✅ |
| Ctrl+I — Insert row | ✅ | — | ❌ |
| Ctrl+Z / Ctrl+Shift+Z — Undo/Redo | ✅ | ✅ | ✅ |

---

## 11. UI / UX

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| About dialog | ✅ | ✅ | ✅ Done | |
| Window position persistence | ✅ | ✅ | ✅ Done | |
| Resizable panels (sidebar, editor) | ✅ | ✅ | ✅ Done | |
| Preview tabs (single-click temp) | ✅ | — | ❌ Missing | |
| Deep link URL scheme | ✅ | — | ❌ Missing | `tablepro://` |
| Auto-update (Sparkle equivalent) | ✅ | — | ❌ Missing | Windows needs MSI/NSIS updater |
| Error boundary | ✅ | ✅ | ✅ Done | ErrorBoundary component |

---

## 12. Packaging & CI

| Feature | macOS | Windows | Status | Notes |
|---------|-------|---------|--------|-------|
| CI build workflow | ✅ (Xcode) | ✅ (GitHub Actions) | ✅ Done | |
| MSI/NSIS installer | — | ✅ | ✅ Done | |
| Code signing | ✅ | — | ❌ Missing | Windows code signing cert |
| Portable ZIP build | — | ✅ | ✅ Done | |

---

## 13. macOS-Only (Not Applicable to Windows)

These features are macOS-specific and do NOT need porting:

| Feature | Reason |
|---------|--------|
| Native macOS window tabs (NSWindow tabbing) | Windows uses its own tab bar |
| .tableplugin bundle format | Windows uses .dll plugin system |
| Sparkle auto-updater | Windows needs Tauri updater plugin |
| Touch ID authentication | Windows Hello (future) |
| macOS vibrancy / NSVisualEffectView | Windows uses its own styling |
| Homebrew Cask install | Windows has MSI/NSIS |
| Finder file association (double-click .sqlite) | Windows file association (registry) |

---

## Summary Score

| Category | Done | Partial | Missing | Total |
|----------|------|---------|---------|-------|
| Drivers | 3 | 0 | 7 | 10 |
| Connection Mgmt | 4 | 0 | 8 | 12 |
| Query Execution | 5 | 0 | 2 | 7 |
| Data Grid | 7 | 1 | 3 | 11 |
| SQL Editor | 6 | 0 | 1 | 7 |
| Side Panels | 5 | 2 | 4 | 11 |
| Export/Import | 4 | 0 | 4 | 8 |
| Structure View | 4 | 0 | 1 | 5 |
| Settings | 5 | 1 | 1 | 7 |
| Storage/Security | 3 | 0 | 3 | 6 |
| AI Features | 0 | 0 | 4 | 4 |
| SSH/Network | 0 | 1 | 4 | 5 |
| Shortcuts | 11 | 0 | 2 | 13 |
| UI/UX | 4 | 0 | 3 | 7 |
| CI/Packaging | 3 | 0 | 1 | 4 |
| **TOTAL** | **64** | **5** | **48** | **117** |

**Overall parity: ~55% Done, ~4% Partial, ~41% Missing**

---

## Priority Recommendations

### P0 — Must have for first Windows release
1. SQLite driver (already listed in UI)
2. Query history (Rust backend + wire to frontend)
3. Tab state persistence
4. Filter panel (WHERE clause builder)
5. Right sidebar / Inspector
6. Save changes end-to-end verification

### P1 — Important for parity
7. MongoDB driver
8. Redis driver
9. SSH tunnel support
10. Import SQL
11. XLSX export
12. Connection groups

### P2 — Nice to have
13. AI Chat + inline suggestions
14. Oracle / ClickHouse / DuckDB drivers
15. Deep link URL scheme
16. Auto-updater
17. Preview tabs
