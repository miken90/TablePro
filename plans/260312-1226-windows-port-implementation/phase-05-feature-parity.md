# Phase 5: Feature Parity (Remaining)

**Duration:** 3 weeks | **Team:** All devs
**Gate:** All user-visible macOS features replicated (minus YAGNI list)

## Feature Checklist

### Connection Management
- [x] Connection form with all fields (host, port, user, password, database, SSL)
- [x] SSL mode picker (disable, require, verify-ca, verify-full)
- [ ] SSL certificate file pickers (CA, client cert, client key)
- [ ] Connection groups (folders in sidebar)
- [ ] Connection tags (color labels)
- [ ] Duplicate connection
- [x] Test connection button
- [x] Connection list persistence (JSON + DPAPI passwords)
- [ ] Multiple simultaneous connections (one per window/tab)
- [x] Database switcher (USE database / connect to different DB)
- [ ] Schema switcher (PostgreSQL SET search_path)

### Query Execution
- [x] Multi-statement execution (split by `;`)
- [x] Query cancellation (Ctrl+. or Escape)
- [ ] Query timeout setting (per-connection)
- [x] Affected rows display
- [x] Execution time display
- [x] Error display with line highlighting in editor
- [x] Query history (SQLite FTS5, search, date filter)
- [ ] EXPLAIN / EXPLAIN ANALYZE

### Schema Browser (Sidebar)
- [x] Tree: Connection → Database → Schema → Tables/Views → Columns
- [x] Table icons (table, view, system table)
- [x] Column type icons
- [x] Primary key indicator
- [x] Foreign key indicator
- [x] Refresh schema (F5)
- [x] Quick switcher (Ctrl+K) — fuzzy search across tables
- [x] Context menu: Copy name, Copy SELECT, Open in new tab
- [x] Table row count in sidebar (approximate)

### Table Structure View
- [x] Column list with type, nullable, default, PK, FK indicators
- [x] Index list with columns, uniqueness, type
- [x] Foreign key list with referenced table/column
- [x] DDL view (CREATE TABLE statement)
- [ ] Schema editing (add/modify/drop columns) — generates ALTER SQL
- [ ] Structure change preview (SQL review before apply)

### Export
- [x] Export to CSV (with options: delimiter, quote, header)
- [x] Export to JSON (array of objects or array of arrays)
- [x] Export to SQL (INSERT statements, with CREATE TABLE option)
- [ ] Export to XLSX (requires a JS library — `xlsx` or `exceljs`)
- [x] Export selected rows or entire table
- [x] Export with progress bar

### Settings
- [x] General: default page size, date format, null display
- [x] Editor: font, size, vim mode toggle, tab size, word wrap
- [x] Appearance: theme (light/dark/system), sidebar width
- [x] Connection: default timeout, safe mode toggle
- [x] All settings persist to `%APPDATA%/TablePro/settings.json`

### Keyboard Shortcuts (Full List)
- [ ] Ctrl+N — New connection
- [x] Ctrl+T — New query tab
- [x] Ctrl+W — Close tab
- [x] Ctrl+Enter — Execute query
- [x] Ctrl+Shift+Enter — Execute all
- [x] Ctrl+. — Cancel query
- [x] Ctrl+S — Save changes (data grid)
- [x] Ctrl+Z — Undo
- [x] Ctrl+Shift+Z — Redo
- [x] Ctrl+K — Quick switcher
- [ ] Ctrl+/ — Toggle line comment
- [ ] Ctrl+D — Add next occurrence to selection
- [x] Ctrl+Shift+F — Format SQL
- [x] F5 — Refresh schema
- [x] Ctrl+, — Open settings
- [x] Ctrl+Shift+E — Toggle sidebar
- [ ] Ctrl+Shift+I — Toggle right panel

### Safe Mode
- [x] Read-only toggle per connection (prevents INSERT/UPDATE/DELETE)
- [x] Visual indicator in toolbar when active

## Implementation Steps

### Week 1: Export + Schema Editing

- [x] Implement `ExportDialog.tsx` with format picker (CSV/JSON/SQL/XLSX)
- [x] Rust: `export.rs` command that streams data → format → file
- [x] CSV export with configurable delimiter/quote/header
- [x] JSON export (objects or arrays)
- [x] SQL export (INSERT statements with optional CREATE TABLE)
- [ ] XLSX export using `calamine` (Rust) or `exceljs` (JS) — evaluate perf
- [x] Export progress via Tauri events (stream progress to frontend)
- [x] Implement `TableStructureView.tsx`:
  - [x] Columns tab (list with editable type/nullable/default)
  - [x] Indexes tab
  - [x] Foreign keys tab
  - [x] DDL tab (read-only CodeMirror with SQL highlighting)
- [ ] Schema statement generator in Rust (ALTER TABLE ADD/MODIFY/DROP COLUMN)
- [ ] SQL review dialog before applying schema changes

### Week 2: Remaining UI

- [x] Query history panel (search, date filter, click to load)
- [x] Quick switcher dialog (Ctrl+K, fuzzy match tables)
- [ ] Connection groups (drag-drop organize, collapsible)
- [x] Settings view (all sections from checklist above)
- [ ] About dialog
- [x] Safe mode toggle + visual indicator
- [x] Database switcher dropdown in toolbar
- [ ] Schema switcher dropdown (PostgreSQL)
- [ ] Error handling: connection lost → reconnect dialog
- [ ] Auto-reconnect with exponential backoff (port `ConnectionHealthMonitor`)

### Week 3: Polish & Edge Cases

- [ ] Multi-window support (one connection per window)
  - Tauri `WebviewWindow::new()` for additional windows
- [ ] Tab persistence across restart (save/restore open tabs + queries)
- [ ] Large query result handling (truncate at 100K rows with warning)
- [ ] Binary data display (`<binary: N bytes>`)
- [ ] Geometry data display (WKT text from WKB)
- [ ] Copy as INSERT / Copy as UPDATE from grid context menu
- [ ] Keyboard shortcut customization (read from settings file)
- [ ] Dark mode / Light mode / System follow
- [ ] Windows high-DPI scaling verification
- [ ] Window position/size persistence

## Licensing (Enterprise Offline)

Port from macOS `LicenseManager`:

```rust
// src-tauri/src/services/license_manager.rs

pub struct LicenseManager {
    license: Option<License>,
    status: LicenseStatus,
    verifier: LicenseSignatureVerifier,
    storage: LicenseStorage,
}

impl LicenseManager {
    /// Offline-first: check local signature, no network required
    pub fn validate_offline(&self) -> LicenseStatus {
        if let Some(license) = &self.license {
            if self.verifier.verify_signature(&license.signed_payload) {
                if license.expires_at > Utc::now() {
                    return LicenseStatus::Valid;
                }
                return LicenseStatus::Expired;
            }
        }
        LicenseStatus::Unlicensed
    }

    /// One-time activation (requires network, then fully offline)
    pub async fn activate(&mut self, key: &str) -> Result<()> {
        let license = self.api_client.activate(key).await?;
        self.verifier.verify_signature(&license.signed_payload)?;
        self.storage.save(&license)?;
        self.license = Some(license);
        Ok(())
    }
}
```

Key differences from macOS:
- No Sparkle auto-update → use Tauri updater plugin (can be disabled for enterprise)
- Password storage: DPAPI instead of Keychain
- License storage: encrypted JSON file in `%APPDATA%`
- Grace period: 30 days offline same as macOS

## Success Criteria

1. All features in checklist above are functional
2. Export works for CSV, JSON, SQL, XLSX
3. Settings persist and apply correctly
4. Schema editing generates correct ALTER SQL
5. Safe mode prevents write operations
6. Query history search returns results in < 100ms
7. Quick switcher fuzzy matches in < 50ms
