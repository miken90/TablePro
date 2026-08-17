# Changelog

All notable changes to TablePro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


Upstream release history (pre-v0.2.0 fork line, and any `v0.9.x`-`v0.65.x` upstream releases) is not part of this repository — this fork's own history starts at v0.2.0.

## [Unreleased]

## [0.7.0] - 2026-08-17

### Added

- Searchable Foreign Key dropdown selector in grid cell editor, dynamically querying referenced table metadata and records

### Removed

- Tauri updater plugin and in-app auto-update notification UI

### Fixed

- SQL Editor: fixed queryText synchronization on editor mount and tab switch, resolving the disabled Run button bug.
- Granular UPDATE SQL generation: copying or generating SQL for edited rows now sets only the columns that were modified, rather than updating all columns. Excludes primary key columns from the `SET` clause of generated SQL UPDATE queries.
- SQL Editor: added support for executing selected SQL statements in Ctrl+Enter keybinding and Run toolbar button, falling back to cursor statement or full text.
- SQL Editor: automatically bind active query tabs to the selected database connection when establishing a connection or switching to an unbound tab.
- DatePicker cell editing formatting for HTML5 inputs, supporting dynamic `.showPicker()` triggers on click/focus and automatic NULL mapping for empty date/numeric inputs
- Grid cell mouse click interception on custom dropdown editors (Foreign Key and Enum) by stopping event propagation on overlay elements
- Performance settings section: configurable `streamingThreshold` (default 10K, range 1K–1M) and `storeMaxRows` (default 100K, range 10K–10M) with backend clamp on save
- Dialect-aware ChangeTracker SQL generation: per-engine boolean literals (`1`/`0` for MySQL & MSSQL, `TRUE`/`FALSE` for Postgres/SQLite) and identifier quoting (backticks for MySQL, square brackets for MSSQL, ANSI double-quotes elsewhere)
- EXPLAIN output detection: single-column `QUERY PLAN` results render without 80-char truncation and auto-size column width up to 4000px
- Crash dump auto-collect: Rust panics are serialised to `%LOCALAPPDATA%\TablePro\crashes\panic-<ts>.json` with secret redaction; WER native dumps in `%LOCALAPPDATA%\CrashDumps\` are surfaced via `list_crash_dumps` / `delete_crash_dump` Tauri commands
- Dual credential storage: opt-in `rememberCredentialsInOsKeychain` setting (default off) and Tauri commands (`cred_save`, `cred_load`, `cred_delete`) that mirror connection passwords into Windows Credential Manager under the `TablePro/<connection-uuid>` namespace. Wired into `connectionStore.saveConnection` (mirrors when toggle ON) and `connectionStore.deleteConnection` (always cleans up CredMan entry).
- Export dialog button on the table browser toolbar, passing active table browse sessionId and full query text instead of queryStore parameters
- Grid cell editing text selection: double-clicking now respects standard browser selection instead of forcing a select-all highlight, while keyboard activation (Enter) retains select-all
- Diagnostics settings tab: crash dump viewer that lists Rust panic JSON dumps + WER native dumps with size and per-entry delete; refuses paths outside known directories.

### Changed

- Cache table query results, pagination, sorting, and enum columns per tab ID via `useTableDataStore` to prevent automatic re-fetching when switching between tabs
- `scripts/build-release.ps1`: removed portable target entirely; script now only builds MSI + NSIS installers via `npx tauri build`. Portable builds were unreliable due to `dist/` embedding issues with raw `cargo build`.
- Split MainLayout god component (503 LOC) into MainLayout shell (138 LOC), ConnectedLayout, and OverlayRegion
- Wrap GridRow and GridHeader in React.memo with stabilized props for fewer re-renders during scroll/selection
- Lazy-load 7 non-critical panels (AiChat, Settings, MongoDB, Redis, Shortcuts, Onboarding, Explain) with per-panel Suspense boundaries
- Add ErrorBoundary around sidebar, editor, inspector, overlays, and status bar regions
- Drivers compiled into binary (was: dynamic DLL plugins via `libloading`)

### Removed

- `plugin-sdk` crate
- DLL plugin loading via `PluginManager`
- `libloading` dependency

### Performance

- ~2x RAM reduction on large query results (FFI clone eliminated)

### Fixed

- Grid column selection: clicking a cell no longer resets pointer to the first column
- Onboarding dialog: settings now loaded from disk on startup, so skipped/completed onboarding persists across restarts

## [0.6.0] - 2026-04-10

### Added

- Connection export/import: share database connections as `.tablepro` files with team members
- Encrypted connection export: passphrase-protected (AES-256-GCM) credential sharing
- Import preview with duplicate detection and resolution (import, skip, replace, copy)
- Copy as Import Link: `tablepro://import?...` URL for sharing via chat/wiki
- `.tablepro` file association: double-click to import

## [0.4.0] - 2026-04-08

### Added

- EXPLAIN query viewer: universal tree parser rendering PG JSON, MySQL JSON, MSSQL XML, SQLite tabular into common ExplainNode tree with per-node cost/rows/width metrics
- Error classification system: structured error-to-action mapping with recovery hints for common database errors (auth, network, syntax, constraint violations)
- Connection tag filtering: sidebar filter dropdown to show/hide connections by environment tag (Production, Staging, Dev, etc.)
- First-launch onboarding: 3-step wizard (welcome → add connection → keyboard shortcuts) with draft mode and skip cleanup
- Bulk insert: TSV paste + CSV file drag-drop (50MB cap, 100-row preview) with 500-row batch INSERT and progress reporting
- Bulk update: structured filter builder (10 operators: =, !=, <, >, <=, >=, IS NULL, IS NOT NULL, LIKE, IN) with preview count and partial failure toast
- Stored procedure/function execute UI: parameter input dialog with string inputs + backend type casting, dangerous proc denylist, result set + output params display
- Vietnamese localization: full i18n framework (i18next + react-i18next), English + Vietnamese locale files, all pre-existing components migrated to `t()` calls
- Sidebar routine node: browse + right-click execute for stored procedures and functions

### Fixed

- SQL identifier injection in DROP statements: all identifiers now use `quote_identifier()` / `qualified_table()`
- `sql_literal` restricted to integer-only values to prevent injection
- Driver DLLs and capability sidecar files now included in NSIS installer bundle
- Grid scrolls to top when pagination changes

## [0.3.0] - 2026-04-04

### Added

- MongoDB driver: connect, browse databases/collections, find() with JSON filter/sort/limit, BSON flattening
- Redis driver: connect with optional TLS, SCAN-based key browser, CLI command panel, support for all data types (string, hash, list, set, sorted set, stream)
- Driver capability substrate: sidecar JSON metadata per driver DLL, capability-aware UI gating
- Centralized command registry: 21 namespaced command definitions, ShortcutsHelp derived from registry
- Customizable keyboard shortcuts: click-to-rebind with conflict detection, persistent user overrides
- Quick switcher rebuild: grouped/ranked results (tables, views, collections, databases, schemas, recent queries)
- Deep-link protocol: `tablepro://open/connection/{id}` for opening saved connections
- Tab state persistence: backend JSON file (`tab-state.json`) replacing localStorage, one-time migration
- Payload-size guardrails: 50k row truncation with `truncated` flag and UI indicator
- Redis database selector in sidebar header (db0-db15)
- MongoDB connection form with SRV toggle, mongodb:// and mongodb+srv:// URL parsing
- Redis connection form with TLS toggle, CA cert path, redis:// and rediss:// URL parsing
- Settings shortcuts section (read-only display of all bindings)

### Changed

- Tab persistence moved from browser localStorage to backend-managed JSON file in Tauri app_data_dir
- Connection reconnect tracking changed from global boolean to per-connection Set
- Plugin manager now loads capability sidecar files alongside driver DLLs
- Schema store gates fetchSchemas/fetchRoutines behind driver capability checks
- Health monitor cleans up stale entries via JoinHandle.is_finished() check

### Fixed

- Shortcut drift: 5 mismatches between ShortcutsHelp and runtime bindings corrected
- Health monitor stale session entries blocking reconnect monitoring
- Tab state race condition: loadConnections() now called before validating restored tabs

## [0.2.0] - 2026-04-01

### Added

- SSH known_hosts TOFU: fingerprint verification for SSH tunnel connections — new hosts accepted with warning, changed keys rejected, stored in `%APPDATA%/TablePro/known_hosts.json`
- Graceful shutdown: all active database sessions and SSH tunnels disconnected on window close
- Connection health detection: frontend listens for `connection:lost` events and shows persistent error toast
- Schema loading timeout: 15-second timeout on `fetchTables` prevents indefinite sidebar loading
- Sidebar filter debounce: `useDeferredValue` prevents jank during rapid typing with large table lists
- Export count timeout: `SELECT COUNT(*)` pre-query capped at 2 seconds — falls back to indeterminate progress
- IPC payload size warning: logs warning when result sets exceed 500K cells
- Confirm discard on closing dirty query tabs: shows confirmation dialog before discarding unsaved SQL
- Background connection ping on tab switch to detect stale sessions
- CI: TypeScript lint step in GitHub Actions build pipeline
- CI: conditional code signing certificate import step (no-op without secrets)
- Version bump script: `scripts/bump-version.ps1 -Version X.Y.Z` updates package.json, tauri.conf.json, and Cargo.toml

- Query Editor UI redesign: Run split-button with dropdown (Run Current, Run All, Explain Plan, Export CSV)
- Query Editor: editor status bar with statement count (`Stmt N/M`), cursor position, selection count, VIM indicator, and SQL dialect badge
- Query Editor: query lifecycle states — running spinner with elapsed time, success green checkmark, error auto-switch to Messages tab
- Query Editor: client-side quick-search in query results via web worker (available in both query and table-browse modes)
- Query Editor: Inspector panel works in both query and table-browse modes via dedicated `inspectorStore`
- Query Editor: double-click cell in query mode copies value to clipboard
- Data Grid: cell-level selection with blue focus ring (active cell) and rectangular range highlight
- Data Grid: keyboard navigation — Arrow/Tab/Shift+Tab/Enter/Esc/Home/End/Ctrl+Home/Ctrl+End/PageUp/PageDown
- Data Grid: rectangular range selection via Shift+click, Shift+Arrow, and mouse drag with auto-scroll
- Data Grid: row selection via row number click, Shift+click for row range
- Data Grid: column selection via "Select Column" in column header menu
- Data Grid: Ctrl+A selects all cells
- Data Grid: mode-aware Ctrl+C — cell copies value, range copies TSV, row/column copies TSV with headers
- Data Grid: right-click context menu adapts to selection mode, includes "Copy Selection" for ranges
- Query Editor: Safe Mode badge shows Shield icon with descriptive tooltip
- Query Editor: resize handles show 3-dot pattern visible at rest across all panels (sidebar, editor, inspector)
- Query Editor: all grid/editor/inspector components use semantic color tokens for theme consistency
- Query Editor: empty state with `Ctrl+Enter` hint when no query results
- Query Editor: checkbox column hidden in query-mode results (read-only)
- Query Editor: PK emoji replaced with Lucide `Key` SVG icon in all grid components
- Query Editor: integer `21px` gutter line height for Windows DPI scaling
- Query Editor: tabs auto-assign connection color on creation
- Query Editor: `EditorViewContext` provider for sharing CM6 EditorView between editor and status bar
- Welcome Page redesign: search/filter connections by name, host, database, engine type, or environment tag with `/` hotkey focus
- Welcome Page: database engine icon (color-coded per type) and environment badge on connection cards
- Welcome Page: formatted URI display (`host:port · database`) instead of raw connection string
- Welcome Page: app logo and version shown in header; version sourced from package.json via Vite define
- Welcome Page: empty state with illustration for first-time users with zero saved connections
- Welcome Page: expanded right-click context menu on all cards (Connect, Edit, Duplicate, Delete) with viewport clamping
- Welcome Page: keyboard navigation — Ctrl+N new connection, Escape close form, ↑/↓ arrow keys between cards, Enter to connect
- Welcome Page: "New Group" demoted from button to text link; connection list max-width increased to 480px
- Welcome Page: connecting state shows spinner + highlighted card border; double-click card triggers connect
- Layout store (Zustand): centralized panel state management with localStorage persistence for sidebar width; eliminates 17 useState calls from MainLayout
- Resizable hook (`useResizable`): generic pointer-drag resize for sidebar, editor height, and inspector panels
- Status bar: persistent bottom bar showing connection status, row count, execution time, and driver type
- StatusBar enhancements: database name, table count, Inspector/Filter toggle buttons with active state indicators
- Sidebar object groups: tables and views displayed in collapsible groups with counts
- History panel slide-over: opens as overlay from right edge instead of stealing horizontal space
- History panel Escape key close and slide-in animation
- Design token `--color-bg-hover` for consistent hover state across light/dark themes
- Active editor tab bottom border indicator (accent blue)
- CM6 compartments: font, vim mode, and SQL dialect changes now reconfigure in-place, preserving undo history and cursor position
- Statement highlighter: subtle background + left border on the SQL statement the cursor is in (the one Ctrl+Enter would execute)
- Error position marker: wavy red underline at the error position when a query fails (PostgreSQL character offset, MySQL line number)
- Code folding: fold gutter with keyboard shortcuts for BEGIN/END blocks, CASE expressions, subqueries, and block comments
- Error position parser utility for extracting character/line offsets from database error messages
- Query duration tracking (`durationMs`) in query store for status bar display
- Editable Structure View: inline column editing (add/modify/drop) with ALTER TABLE preview and per-driver SQL generation (Postgres, MySQL, MSSQL; SQLite drops/modifies disabled)
- JSON record view in Inspector panel: toggle between field list and pretty-printed JSON with copy button; type-aware coercion (numbers, booleans, JSON/JSONB, binary)
- SQL Preview button in change toolbar: shows generated BEGIN/COMMIT SQL before saving with copy-to-clipboard
- SSH key file picker now includes "All Files (*)" filter and `.ppk` extension; opens in `~/.ssh/` by default
- Save confirmation dialog: Ctrl+S and Save button now show SQL preview modal before executing changes, with Execute/Cancel/Copy SQL actions
- F5 refresh in table-browse mode: refreshes table data (not just schema); prompts Save & Refresh / Discard & Refresh / Cancel when unsaved changes exist
- Cell tooltip: hovering over truncated cells shows full value as native tooltip (capped at 1024 chars)
- Column auto-fit: double-clicking resize handle auto-fits column width to content using Canvas text measurement (capped at 600px)
- SQL Editor: syntax highlighting with light/dark color palettes — keywords, strings, numbers, comments, operators, types each get distinct colors, auto-switches via compartment on theme change
- Grid: Ctrl+C copies selected rows as TSV with header row (NULL → empty string)
- Inspector: hover-reveal copy button per field row (copies value to clipboard, NULL copies as "NULL")
- Messages panel: hover-reveal copy button per log entry (copies SQL + error text)
- Grid: inline cell editing — double-click opens input directly in cell (text, number, boolean dropdown, date picker), Enter/Tab commits, Escape cancels, Ctrl+Delete sets NULL

### Fixed

- PostgreSQL column types all showing as "text": `simple_query` result handler now reads real type from `tokio_postgres::Column::type_()` (int4, bool, timestamptz, uuid, etc.)
- Quick search failing on UUID/integer columns: now uses `CAST("col" AS TEXT) LIKE` for all column types (cross-DB compatible); also escapes LIKE wildcards (%, _) in search term
- MSSQL functions sidebar showing system routines: excluded `sys`, `INFORMATION_SCHEMA`, `guest` schemas from routines query
- Grid checkbox column removed: unused `checkedRows` state and visual checkboxes eliminated, reclaiming 40px of horizontal space

- MySQL table browsing broken for tables with reserved-word names: `fetch_rows`/`fetch_count` now use driver-aware identifier quoting (backticks for MySQL, brackets for MSSQL) via `quote_identifier()` instead of hardcoded ANSI double-quotes
- WHERE clause validator false-positive on column names containing SQL keywords (e.g. `drop_reason`, `deleted_at`): switched from substring matching to word-boundary detection
- Potential panic in SQLite and MSSQL drivers: replaced `Mutex::lock().unwrap()` with poison-resistant `unwrap_or_else` across all driver crates (17 call sites)
- Potential panic in export command when output file handle is None: replaced 3 `unwrap()` calls with proper `AppError` propagation
- External URL opening not working: registered `tauri-plugin-shell` in Rust backend and added `shell:allow-open` capability
- SSH tunnel connections hanging indefinitely: blocking FFI driver calls now run on dedicated threads (`spawn_blocking`) so the Tauri async runtime stays free to service SSH tunnel forwarding tasks
- Connection mutex held too long during SSH connect/test: lock is now released before driver connect so tunnel I/O can proceed

- Grid header horizontal scroll: replaced dual-container scroll sync with single scroll container + `position: sticky` — header and body now scroll together natively
- `[object Object]` rendering in grid cells and quick search: added `safeString()` helper and object type guards in grid-row, cell-formatter, and quick-search-bar
- `[object Object]` error messages in Messages tab and toast notifications: centralized all error extraction through `extractErrorMessage()` with robust object/JSON fallbacks
- App icon shows correctly in dev mode (previously showed generic blue square): icon now set programmatically via Rust `setup()` callback using `include_bytes!`
- Custom scrollbar styling: thin 6px scrollbars themed with CSS variables for dark/light mode
- Migrated result-status-bar from hardcoded `zinc-*` classes to semantic CSS variable tokens
- Migrated 7 components from hardcoded `zinc-*` colors to semantic design token classes (`bg-surface`, `text-text-primary`, `border-border-subtle`, etc.)
- Inactive editor tabs now have `border-b-2 border-b-transparent` to prevent height shift when switching active tab

- Design system foundation: semantic color tokens, typography scale, spacing system, CSS custom properties for light/dark themes
- Environment badges for connections (PROD/STAGE/DEV/LOCAL) with visual distinction
- Connection status indicators (connected/connecting/disconnected/error) with animated states  
- Collapsible connection groups in sidebar organized by environment tag
- Recent connections section in sidebar for quick reconnect
- Command palette (Ctrl+Shift+P) with fuzzy search across all app actions
- Tab type icons distinguishing query, table, and structure tabs
- Tab pinning with persistent positioning
- Tab context menu (right-click) with close, pin, close-others actions
- Connection color indicator on active tabs (bottom border)
- Toast notifications for query execution, connection events, and save operations
- NULL value display as distinct styled badge in data grid
- Diff indicators on grid rows (green=insert, yellow=update, red=delete)
- Column header menu with sort, filter, hide, and copy-name actions
- Type-aware cell formatting for JSON, UUID, dates, and booleans
- Checkbox column for bulk row selection
- Smart filter bar with syntax: `column:value`, `column:>value`, `column:!=value`
- Filter chips showing active filter conditions with individual remove
- Filter preset save/load integration
- Skip-to-content link for keyboard users
- Screen reader announcements for query results and connection changes
- ARIA labels on all interactive elements across the app
- Tab bar keyboard navigation (Left/Right arrow keys)
- Prefers-reduced-motion support for all animations
- Global consistent focus ring styling (2px blue outline)

- Windows: Result panel pagination controls now include First/Last page buttons and row-range display (`X–Y of Z rows`) for clearer navigation in table browse/query results
- Windows: Query History entries now support one-click SQL copy via a hover copy button with visual copied-state feedback
- Windows: Auto-updater — Tauri updater plugin checks for updates on launch (4h debounce), shows non-blocking notification with version/changelog, download progress, and install+restart flow
- Windows: Connection URL import — "Import from URL" button in ConnectionForm parses `mysql://`, `postgresql://`, `postgres://`, `mssql://`, `sqlserver://` URLs into form fields with edge case handling
- Windows: Connection color picker — 10 preset color dots in ConnectionForm; color indicator shown in sidebar and toolbar when connected
- Windows: Connection tags — environment labels (Production, Staging, Dev, Testing, Local, custom) with colored badges in sidebar and toolbar
- Windows: Startup commands — per-connection SQL commands executed automatically after connect (non-blocking on failure), configured in Advanced section of ConnectionForm
- Windows: Copy as SQL — right-click rows in data grid to "Copy as INSERT" or "Copy as UPDATE" with per-driver quoting; also "Copy Row (TSV)" and "Copy Cell"
- Windows: ENUM/SET picker — dropdown cell editor for MySQL ENUM columns and multi-select checkboxes for SET columns, fetched via `fetch_enum_values` command
- Windows: Approximate row count — instant `~N rows` display in status bar using database metadata (pg_class/INFORMATION_SCHEMA/sys.partitions) before exact count loads
- Windows: Quick search bar — single text input above data grid that filters rows with debounced LIKE across all text columns; Esc clears
- Windows: Filter presets — save/load/delete named filter configurations per table, persisted in `%APPDATA%/TablePro/filter-presets.json`
- Windows: Query progress events — real-time elapsed time display during query execution with started/progress/completed/error Tauri events
- Windows: Create Table wizard — visual GUI to define table name, columns (name, type, nullable, default, PK), preview generated DDL, and execute; per-driver DDL syntax (PG/MySQL/MSSQL/SQLite)
- Windows: Preview tabs — single-click table opens temporary italic tab (one at a time, replaced on next click); promoted to permanent on edit, double-click tab, or Ctrl+click; double-click table still opens Structure View
- Windows: SQL activity log — `queryLogStore` tracks all executed queries (editor + table-browse) with source, duration, row count, and timestamps; displayed in Messages tab of ResultPanel
- Windows: Table browse mode — clicking a table in the sidebar now shows a dedicated full-height data grid view (no editor split); "Query Editor" button in table toolbar to switch back; Run button in toolbar automatically switches back to query editor mode and shows results
- Windows: Connection credential protection at rest — `ConnectionStore` now persists `password`, `ssh_password`, and `ssh_key_passphrase` with `dpapi:`-prefixed DPAPI encryption and migrates legacy plaintext values on load
- Windows: Export SQL identifier quoting service — per-driver quoting/escaping for PostgreSQL/SQLite (`"`), MySQL/MariaDB (`` ` ``), and MSSQL (`[]`) to prevent unsafe identifier interpolation in generated SQL exports
- Windows: Import/export memory hardening — JSON export now streams rows directly to disk; SQL import uses buffered statement streaming for plain and `.gz` files instead of full-file reads
- Windows: Async runtime hardening — blocking file and SQLite history operations on async command paths were isolated from Tokio worker threads
- Windows: Frontend performance pass — ResultPanel selectors/memoization tightened, unused MainLayout schema subscription removed, and SQL editor dependencies are loaded lazily
- Windows: Modularization pass — extracted focused modules/components from oversized frontend and Rust files while keeping existing behavior and public APIs

### Fixed

- Windows: Dev runtime crash — Tauri CLI `dev` command silently killed the app process after 2-5 minutes even with `--no-watch`; replaced with independent Vite + cargo dev script (`scripts/dev.ps1`) that bypasses Tauri CLI process management
- Windows: Updater plugin mismatch — `tauri-plugin-updater` was in Cargo.toml deps and capabilities but never registered in the Tauri builder; now properly initialized
- Windows: Reduced backend crash risk during shutdown and startup — `ConnectionManager` now drops active drivers before releasing plugin manager state, and query history initialization falls back to in-memory storage instead of panicking when the on-disk database cannot open
- Windows: Avoided a post-connect metadata prefetch burst that could overwhelm Tauri IPC/plugin calls and destabilize dev runtime on large schemas; column metadata now stays demand-driven instead of loading every table up front
- Windows: Added renderer crash instrumentation so uncaught frontend errors, unhandled promise rejections, and startup beacons are written to `%APPDATA%/TablePro/renderer-errors.log` for future crash triage
- Windows: Run button now correctly shows query results even when previously in table-browse mode (was silently discarding `queryResult` when `isTableMode` was active)
- Windows: Inline edit Ctrl+S shortcut — pressing Ctrl+S now triggers Save Changes when unsaved edits exist in table-browse mode

- Windows: SSH tunnel support — `russh`-based (pure Rust, no C deps) SSH tunneling with password and private key authentication, local port forwarding, `SshTunnelManager` for lifecycle management, integrated into `connection_manager` connect/disconnect/test flows, SSH section in ConnectionForm with host/port/username/auth method fields
- Windows: Import SQL — full-featured `.sql` and `.sql.gz` file import with statement scanner (handles strings, dollar-quoted blocks, comments), preview mode (statement count, file size, first statements), sequential execution with Tauri progress events, transaction wrap and FK-check-disable options, `flate2` gzip decompression, Import dialog with file picker and progress bar (Ctrl+Shift+M shortcut)
- Windows: XLSX export — `rust_xlsxwriter` integration in `export.rs` with type-aware cell writing (numbers, booleans, text), 1M row cap
- Windows: Keyboard shortcuts + Help dialog — `ShortcutsHelp.tsx` overlay (F1/Ctrl+?) listing 21 shortcuts in 5 groups (Editor, Tabs, Data Grid, Navigation, General); new shortcuts: Ctrl+I (insert row), Ctrl+Tab/Ctrl+Shift+Tab (tab switching), Ctrl+Shift+M (import SQL), F1 (help)
- Windows: Connection groups (sidebar folders) — `ConnectionGroup` struct with id/name/color/order/collapsed, persisted to `groups.json` in `%APPDATA%/TablePro/`; 3 new Tauri IPC commands (`list_groups`, `save_group`, `delete_group`); collapsible group sections with colored left border in WelcomeView; group assignment dropdown in ConnectionForm; deleting a group ungroups its connections
- Windows: Safe mode 6 levels — Silent (0), Alert (1), Alert Full (2), Safe Mode (3), Safe Mode Full (4), Read-Only (5); regex-based destructive query detection in `queryStore`; `SafeModeConfirmDialog` for levels 1-4; Read-Only blocks all writes at level 5; cycling badge in Toolbar; settings dropdown replaces boolean toggle
- Windows: PostgreSQL schema switching — `fetch_schemas` Tauri command, schema state in `schemaStore`, quick-switcher schema section (Ctrl+K), sidebar schema dropdown with table filtering
- Windows: FK navigation arrows — FK metadata map in `schemaStore`, ExternalLink icons in grid cells for FK columns, click opens new editor tab with pre-filled `SELECT * FROM referenced_table WHERE pk = value` query

- Windows: SQLite driver plugin — `driver-sqlite` cdylib crate using rusqlite (bundled), PRAGMA-based schema introspection, WAL mode, query cancel via `sqlite3_interrupt`
- Windows: Query History backend — rusqlite + FTS5 full-text search stored in `%APPDATA%/TablePro/history.sqlite3`, 5 Tauri IPC commands (fetch_recent, search, clear_all, delete_entry, record)
- Windows: Query History panel — right sidebar (Ctrl+H or clock icon) showing executed queries with search, relative timestamps, status indicators; click to load query into editor
- Windows: Tab state persistence — Zustand `persist` middleware saves editor tabs to localStorage across app restarts (100KB/tab cap)
- Windows: Save changes end-to-end — wired `handleSave` to IPC `save_changes` with proper table/schema context plumbing from Sidebar through MainLayout to ResultPanel
- Windows: Filter panel (WHERE clause builder) — FilterPanel component with add/remove filter rows, AND/OR logic toggle, quick search across all columns, Rust-side `where_clause` param on `fetch_rows`/`fetch_count` with SQL injection sanity check, Ctrl+Shift+F toggle
- Windows: Inspector panel (right sidebar) — InspectorPanel showing selected row's column-value pairs with type-aware rendering (NULL, boolean, JSON, long text expand), resizable right panel, Ctrl+Shift+I toggle

- Windows port: Phase 6 QA & Packaging — Rust unit tests (30+ tests for sql_generator, models, storage, plugin-sdk), TypeScript unit tests via Vitest (30+ tests for Zustand stores, column-type categorization, statement scanner, editor utilities), MSI/NSIS packaging configuration with resources bundling, GitHub Actions Windows CI workflow, portable ZIP build script, About dialog, window position persistence, Ctrl+N new tab and Ctrl+/ toggle comment shortcuts

### Fixed

- Windows: App crash on launch or after connecting — Vite dev server (`http://localhost:1420`) destabilized WebView2 renderer; `tauri dev` now builds frontend to `dist/` and serves from embedded files instead of the dev server
- Windows: Dev server crash loop — `tauri dev` exited after ~50s due to file watcher feedback loop (static `vite build` into `dist/` triggered spurious Cargo rebuilds) compounded by PDB filename collision between bin/lib targets and Vite HMR full-page reloads from unignored `src-tauri/` writes; restored Vite dev server (`devUrl`), reduced lib crate-type to `rlib`, and added `server.watch.ignored` for `src-tauri/`
- Windows: Grid header not scrolling horizontally with data — synced header scrollLeft with body scroll via onScroll handler
- Windows: Server-side pagination and sorting — table browse now uses `fetch_rows` with LIMIT/OFFSET/ORDER BY instead of loading all rows into memory; page and sort changes re-query the database
- Windows: DevTools accessible in release builds — moved `devtools` cargo feature behind optional flag, disabled right-click context menu and F12/Ctrl+Shift+I in production
- Windows: History not recording executed queries — added `historyRecord` IPC call after query execution (success and error)
- Windows: Table records not editable — double-click on a cell now opens inline editor; blur/Enter commits change via changeStore with undo/redo; Escape cancels edit
- Windows: Non-text column values (integers, booleans, floats, JSON) showing as NULL in PostgreSQL — switched `execute()` from `client.query()` to `simple_query()` which returns all values as text, bypassing broken typed extractors through the FFI pipeline
- Windows: `fetch_count` always returning 0 — concurrent `Promise.all` IPC calls caused mutex contention; changed to sequential fetch and cast `COUNT(*)` to text
- Windows: NULL values indistinguishable from empty strings in MySQL and MSSQL — NULL cells now emit `FfiString::null()` instead of `string_to_ffi("")` so the FFI adapter correctly maps them to `None`
- Windows: Saved connections lost on app restart — `ConnectionStore.load()` was never called at startup; connections.json was written but never read back
- Windows: Connection form always defaulting to port 5432 — port now auto-updates when switching database type (PostgreSQL 5432, MySQL 3306, MSSQL 1433); SQLite hides host/port/user fields; placeholder hints added
- Windows: SQL editor inaccessible without clicking a table first — editor area now shows immediately on connection with auto-created blank tab
- Windows: SQL autocomplete missing table/column names — columns now eagerly prefetched for all tables after schema loads, populating the completion store
- Windows: No way to disconnect and return to connection page — added disconnect button (Unplug icon) in Toolbar; clears editor tabs and schema on disconnect
- Windows: SQL editor showing blank white screen — CodeMirror EditorView was created with empty deps `[]` causing it to miss initial `activeTabId`; separated mount from tab-switching effects
- Windows: Sidebar single-click on table not loading data — added `onOpenTable` callback that creates tab + executes `SELECT *` immediately; chevron click expands/collapses columns; double-click opens View Structure; "Open Table" context menu item added
- Windows: Toolbar Run button disabled after programmatic tab creation — `setQueryText()` now called in `handleOpenTable` and `handleQuickSwitcherSelect` so generated SQL is recognized by the Run button
- Windows: Plugin DLLs not discovered during `tauri dev` — added fallback to scan exe directory for `driver_*.dll` alongside `plugins/` subdirectory
- Windows: PostgreSQL connection failing with "invalid connection string" when database field is empty — replaced string concatenation with `tokio_postgres::Config` builder API
- Windows: All IPC commands after connect returning `NotConnected` — frontend now maps SavedConnection IDs to Rust session UUIDs and passes the correct session UUID to all backend commands (query execution, schema fetch, cancel, export, structure view)
- Windows: White page crash after fetch_tables — Rust model structs (`ColumnInfo`, `QueryResult`, `TableInfo`, `IndexInfo`, `ForeignKeyInfo`) missing `#[serde(rename_all = "camelCase")]`, causing snake_case JSON field names that didn't match camelCase TypeScript types. `result.executionTimeMs.toFixed()` on `undefined` crashed React
- Windows: Error messages showing `[object Object]` — Tauri IPC errors are plain JSON objects (`{kind, message}`), not `Error` instances. Added `extractErrorMessage()` helper and ErrorBoundary
- Windows port: Phase 5 complete — Export to CSV, JSON, SQL with progress tracking and format-specific options; Table Structure View with Columns, Indexes, Foreign Keys, and DDL tabs; Settings panel with General, Editor, Appearance, and Connection sections; Quick Switcher (Ctrl+K) for fuzzy table search; Theme system (Light/Dark/System follow) with OS preference detection; Safe mode visual indicator in toolbar with toggle; Sidebar column expansion with type-aware icons and context menu; 6 new keyboard shortcuts: Ctrl+S, Ctrl+Shift+F, F5, Ctrl+,, Ctrl+Shift+E, Ctrl+K; 3 new settings: tabSize, wordWrap, dateFormat
- Windows port: Phase 4 Data Grid & CRUD — TanStack Virtual+Table grid replacing SimpleGrid (100K row virtual scroll, column resize/sort, row selection with shift/ctrl multi-select), type-aware CellEditor (boolean/json/date/text), Zustand changeStore with full undo/redo stack, visual change indicators (yellow=modified, green=inserted, red=deleted), ChangeToolbar with Save/Discard/Undo/Redo, Pagination component, Rust `sql_generator` (INSERT/UPDATE/DELETE with SQL injection-safe escaping), `data:save_changes` IPC command, column type categorization system
- Windows port: Phase 3 SQL editor — CodeMirror 6 with SQL syntax highlighting (PostgreSQL/MySQL/MSSQL dialect support), schema-aware autocomplete (context-sensitive completions for tables, columns, functions, keywords based on clause type), Vim mode with ex-commands (:w/:q/:e), SQL formatting (Ctrl+Shift+F), multi-tab editor with per-tab state, keyboard shortcuts (Ctrl+Enter run query, Ctrl+Shift+Enter run all, F5 refresh schema, Ctrl+D select next occurrence)
- Windows port: Phase 2 driver plugins — PostgreSQL (tokio-postgres + native-tls), MySQL (mysql_async), SQL Server (tiberius) as cdylib DLLs with full schema introspection (tables, columns, indexes, foreign keys, DDL generation, database listing)
- Windows port: Phase 1 foundation scaffold — Tauri v2 + Rust backend (19 IPC commands, models, storage, connection manager) + React/TypeScript frontend (14 components, 6 Zustand stores, full layout shell with resizable panels)
- `SettablePlugin` protocol in TableProPluginKit SDK: unified settings pattern for all plugins with automatic persistence via `loadSettings()`/`saveSettings()`, replacing duplicated boilerplate across export/import/driver plugins
- Plugin UI/capability metadata: each driver plugin now self-declares brand color, connection mode, supported features, column types, URL schemes, and grouping strategy via the `DriverPlugin` protocol
- Driver plugin settings view support: `DriverPlugin.settingsView()` allows plugins to provide custom settings UI in the Installed Plugins panel
- Dynamic connection fields: connection form Advanced tab now renders fields from `DriverPlugin.additionalConnectionFields` instead of hardcoded per-database sections, with support for text, secure, and dropdown field types
- Configurable plugin registry URL via `defaults write com.TablePro com.TablePro.customRegistryURL <url>` for enterprise/private registries
- SQL import options (wrap in transaction, disable FK checks) now persist across launches
- `needsRestart` banner persists across app quit/relaunch after plugin uninstall
- Copy as INSERT/UPDATE SQL statements from data grid context menu
- Plugin download count display in Browse Plugins — fetched from GitHub Releases API and cached for 1 hour
- MSSQL query cancellation (`cancelQuery`) and lock timeout (`applyQueryTimeout`) support
- `~/.pgpass` file support for PostgreSQL/Redshift connections with live validation in the connection form
- Pre-connect script: run a shell command before each connection (e.g., to refresh credentials or update ~/.pgpass)

### Fixed

- Windows: Database switching from sidebar dropdown now works — PostgreSQL requires a new connection per database, so `switch_database` command disconnects and reconnects with the selected database name. Tables auto-refresh after switching. Initially connected database auto-selects on load.
- Plugin icon rendering now supports custom asset images (e.g., duckdb-icon) alongside SF Symbols in Installed and Browse tabs

