# Changelog (Windows)

All notable changes to TablePro Windows will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-04-05

### Added

- Full i18n migration of all UI components using i18next + react-i18next
- Vietnamese (Tiếng Việt) translation (`vi.json`)
- Language selector in Settings with immediate switching (no restart required)

## [0.3.3] - 2026-04-05

### Added

- Bulk insert: TSV paste and CSV file drag-drop with 50 MB file cap, 500-row batch processing
- Bulk update: structured filter builder with 10 operators (no freeform WHERE injection)
- Dry-run preview for bulk update operations
- Transaction wrapping for bulk operations with partial failure reporting
- Stored procedure execution with parameter inputs and SQL preview
- System procedure denylist for security (blocks system-owned routines)
- Procedure source viewer with syntax highlighting, copy, and edit support
- Sidebar context menu for routines: Execute, View Source, Copy Name

### Changed

- Grid context menu extended with bulk insert/update actions

## [0.3.2] - 2026-04-05

### Added

- Connection tag filtering with chip bar in sidebar
- Tag management: create/delete tags with custom color picker
- Multi-tag AND filtering with persistence across sessions
- First-launch onboarding dialog (3-step: welcome, add connection, keyboard shortcuts)
- Draft mode connection form in onboarding (no zombie connection state on cancel)

## [0.3.1] - 2026-04-05

### Added

- Error classifier with recovery hints (`classifyError` with kind-based suggestions)
- Upgraded toast system with severity levels (info, warning, error) and action buttons
- EXPLAIN query viewer for PostgreSQL, MySQL, MSSQL, and SQLite
- Universal tree parser renders all engine EXPLAIN plans uniformly
- `Ctrl+Shift+X` keyboard shortcut for EXPLAIN
- i18n framework setup (i18next + react-i18next wiring)

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

- SSH known_hosts TOFU: fingerprint verification for SSH tunnel connections
- Graceful shutdown: all active database sessions and SSH tunnels disconnected on window close
- Connection health detection: frontend listens for `connection:lost` events and shows persistent error toast
- Schema loading timeout: 15-second timeout on `fetchTables` prevents indefinite sidebar loading
- Sidebar filter debounce: `useDeferredValue` prevents jank during rapid typing with large table lists
- Export count timeout: `SELECT COUNT(*)` pre-query capped at 2 seconds
- IPC payload size warning: logs warning when result sets exceed 500K cells
- Confirm discard on closing dirty query tabs
- Background connection ping on tab switch to detect stale sessions
- CI: TypeScript lint step in GitHub Actions build pipeline
- Version bump script: `scripts/bump-version.ps1`
- Query Editor UI redesign with Run split-button dropdown
- Editor status bar with statement count, cursor position, VIM indicator, SQL dialect badge
- Query lifecycle states (running spinner, success checkmark, error auto-switch)
- Client-side quick-search in query results via web worker
- Inspector panel for both query and table-browse modes
- Data Grid cell-level selection, keyboard navigation, range selection, copy modes
- Welcome Page redesign with search/filter, engine icons, environment badges
- Layout store (Zustand) for centralized panel state management
- Resizable hook (`useResizable`) for sidebar, editor, and inspector panels
- Status bar with connection status, row count, execution time, driver type

### Changed

- Tab persistence moved from browser localStorage to backend-managed JSON file
- Connection reconnect tracking changed from global boolean to per-connection Set

### Fixed

- Shortcut drift between ShortcutsHelp and runtime bindings
- Health monitor stale session entries blocking reconnect monitoring

[Unreleased]: https://github.com/TableProApp/tablepro-windows/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/TableProApp/tablepro-windows/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/TableProApp/tablepro-windows/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/TableProApp/tablepro-windows/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/TableProApp/tablepro-windows/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/TableProApp/tablepro-windows/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/TableProApp/tablepro-windows/releases/tag/v0.2.0
