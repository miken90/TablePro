# TablePro Product Development Requirements (PDR)

## Product Vision

TablePro is a **native database client** that brings professional SQL development and data exploration to desktop platforms. It combines native platform integration, modern UI, and intelligent features to eliminate context switching between databases, editors, and tools.

**Mission**: Enable developers to query, explore, and manage any database efficiently through a single, beautifully-crafted native application.

## Product Goals

1. **Multi-Platform Support**: Native clients for macOS and Windows, with potential Linux support
2. **Database Agnostic**: Support 11+ database engines through a plugin system
3. **Developer Experience**: Minimize cognitive load through autocomplete, inline editing, and intelligent SQL assistance
4. **Safe Operations**: Change tracking, transaction management, and confirmation workflows to prevent data loss
5. **Extensibility**: Plugin ecosystem for drivers, export formats, and import handlers
6. **Performance**: Fast connection pooling, query history, and responsive UI for large datasets

## Target Platforms

| Platform | Status | Architecture | Toolchain |
|----------|--------|--------------|-----------|
| **macOS** | Stable (v0.17.0) | SwiftUI + AppKit hybrid | Xcode, Swift 5.9+ |
| **Windows** | Phase 6 Complete | Tauri v2 + Rust + React | Rust, Node.js, TypeScript |
| **Linux** | Planned | Tauri v2 (Windows approach) | Rust, Node.js, TypeScript |

## Supported Databases

TablePro provides native drivers and autocomplete for:

- **SQL Databases**: MySQL/MariaDB, PostgreSQL, SQL Server, SQLite, Oracle
- **Cloud Data**: Redshift (AWS), BigQuery (planned)
- **NoSQL**: MongoDB, Redis
- **Analytics**: ClickHouse, DuckDB

Each database has dedicated documentation and driver implementation, with connection presets for common configurations.

## Core Features

### SQL Editor & Execution
- CodeMirror 6 editor with Vim/Emacs keybindings
- Database-aware autocomplete (tables, columns, functions)
- Query history with full-text search (SQLite FTS5)
- Quick Switcher (Cmd+K/Ctrl+K) for fuzzy table/view search
- Multiple query tabs with state persistence
- Statement execution with formatted result display

### Inline Data Editing
- Point-and-click cell editing within results
- Automatic SQL generation (INSERT/UPDATE/DELETE)
- Copy as INSERT/UPDATE SQL from grid context menu
- Change tracking with visual indicators
- Undo/redo with transaction wrapping
- Safeguards: confirmation dialogs, Safe Mode for large updates

### Data Exploration
- Interactive data grid with virtual scrolling (handles millions of rows)
- Table structure viewer (columns, indexes, keys, constraints)
- Filter presets with save/load
- Column sorting, type indicators
- Export to CSV, JSON, SQL, XLSX

### Data Import/Export
- Multi-format support (CSV, JSON, SQL, XLSX, MQL for MongoDB)
- Bulk insert operations via transactions
- Schema auto-detection from CSV headers
- Native File → Database workflows

### Advanced Features
- **SSH Tunneling**: Secure connections to remote databases
- **SSL/TLS Support**: Encrypted connections with cert management
- **AI Assistant** (macOS): SQL generation, query optimization suggestions
- **Connection Management**: Save/edit connection profiles with password encryption (DPAPI on Windows, Keychain on macOS)
- **Tab Persistence**: Restore all editor tabs and query state across sessions
- **Query History**: Timestamped history with search, keyboard navigation
- **Quick Switcher**: Fuzzy search for tables and views (Cmd+K/Ctrl+K)
- **Pre-Connect Script**: Run shell command before each database connection (.pgpass, custom commands)
- **Plugin Metadata**: Drivers self-declare brand colors, capabilities, connection field requirements

## Technical Stack

### macOS (Stable)
- **UI Framework**: SwiftUI + AppKit
- **Database Access**: DatabaseDriver protocol (async/await)
- **Plugin System**: .tableplugin bundles with code signature verification
- **Storage**: UserDefaults (settings), Core Data / custom JSON (history, tabs)
- **Password Storage**: macOS Keychain

### Windows (In Progress → Phase 6 Complete)
- **Desktop Framework**: Tauri v2 (Chromium + native window)
- **Backend**: Rust with tokio async runtime
- **Frontend**: React 18 + TypeScript with Zustand (state management)
- **Plugin System**: C-ABI FFI with libloading (DLL plugins)
- **Storage**: DPAPI for passwords, JSON files, SQLite for history
- **IPC**: Typed Tauri commands with TauriError handling
- **Status**: All 6 development phases complete (foundation, drivers, editor, grid/CRUD, settings/UI, QA/packaging)

### Shared Patterns
- **Connection Pooling**: Reuse active connections for performance
- **Async/Await**: Non-blocking queries, responsive UI
- **Change Tracking**: Local diff tracking before commits
- **Error Handling**: User-friendly error messages, logging for debugging

## Plugin System Architecture

TablePro supports extensible plugins for drivers, export formats, and import handlers.

### macOS Plugin Format
- **Type**: Xcode bundles (.tableplugin)
- **Interface**: Swift protocol `PluginDatabaseDriver`, `ExportFormatPlugin`, `ImportFormatPlugin`
- **Verification**: Code signature validation on load
- **Packaging**: Bundle with Swift dylib + resources
- **Distribution**: Plugin registry (documented in `docs/development/plugin-registry.mdx`)

### Windows Plugin Format
- **Type**: Dynamic libraries (.dll, C ABI)
- **Interface**: C vtable with function pointers (`PluginVTable`)
- **Verification**: Loaded via `libloading` with version validation
- **Packaging**: Cargo cdylib crate (driver-postgres, driver-mysql, etc.)
- **Distribution**: GitHub releases, future plugin registry

### Plugin Examples
- **Drivers**: PostgreSQL, MySQL, SQLite, Oracle, Redis, MongoDB, ClickHouse, DuckDB, MSSQL
- **Export**: CSV, JSON, SQL, XLSX, MQL (MongoDB)
- **Import**: SQL, CSV (auto-detection)

## Storage & Persistence

| Data | Location | Format | Encryption |
|------|----------|--------|------------|
| **Connections** | `%APPDATA%/TablePro/` (Windows) / UserDefaults (macOS) | JSON | DPAPI (passwords) |
| **Query History** | `%APPDATA%/TablePro/history.db` (Windows) | SQLite FTS5 | N/A |
| **Tab State** | `%APPDATA%/TablePro/tabs/` (Windows) | JSON per tab | N/A |
| **User Settings** | `%APPDATA%/TablePro/settings.json` (Windows) | JSON | N/A |
| **Filter Presets** | `%APPDATA%/TablePro/` (Windows) | JSON | N/A |

## Acceptance Criteria

### Core Functionality (MVP)
- ✅ Connect to 11 supported databases
- ✅ Execute arbitrary SQL queries
- ✅ Browse table structure with column/index info
- ✅ Edit inline data with automatic SQL generation
- ✅ Undo/redo changes before commit
- ✅ Export results to multiple formats
- ✅ Save/load connection profiles securely
- ✅ Search query history

### Code Quality
- ✅ All IPC commands fully typed (Rust ↔ TypeScript)
- ✅ No `unwrap()` on user data (Rust)
- ✅ Structured logging with `tracing` crate (Rust)
- ✅ Error messages user-friendly, not stack traces
- ✅ ESLint + Prettier passing (TypeScript)
- ✅ cargo clippy passing (Rust)

### Platform Parity
- ✅ Feature parity between macOS and Windows (by Phase 3)
- ✅ UI consistency within platform conventions
- ✅ Performance: sub-1s query execution for <1M rows
- ✅ Virtualized rendering for large datasets (>10K rows)

### Security
- ✅ No plaintext passwords in config files or logs
- ✅ DPAPI encryption for stored credentials (Windows)
- ✅ SSL/TLS option for all supported databases
- ✅ SSH tunnel support for remote access
- ✅ No secrets in git history

### Testing & Release
- ✅ Unit tests for core business logic
- ✅ Integration tests for IPC layer (Windows)
- ✅ E2E tests for multi-database workflows
- ✅ Signed MSI installer (Windows)
- ✅ Notarized DMG (macOS)
- ✅ CHANGELOG.md updated per release

## Non-Functional Requirements

| Requirement | Target | Implementation |
|-------------|--------|-----------------|
| **Startup Time** | <2s | Native platform window, async plugin load |
| **Query Execution** | <1s for <1M rows | Connection pooling, non-blocking async |
| **Grid Virtualization** | 60fps for 100K rows | React virtualization, CodeMirror viewport |
| **Memory Usage** | <500MB idle | No full DOM for large datasets, streaming results |
| **IPC Payload Size** | <1MB per invoke | Stream large result sets in chunks |

## Release Schedule

| Phase | Status | Timeline | Scope |
|-------|--------|----------|-------|
| **Phase 1: macOS Foundation** | ✅ Complete | v0.1–0.17 | Native SwiftUI client, plugin system, 11 drivers, features |
| **Phase 2: Windows Port** | ✅ Phase 6 Complete | v0.18–0.20 | Tauri v2 port, feature parity, Windows-native polish |
| **Phase 3: Platform Parity** | 📋 Planned | v0.21+ | Full feature alignment, AI assistant on Windows, Linux support |
| **Phase 4: Cloud & Expansion** | 📋 Planned | Future | BigQuery, Snowflake, cloud sync, collaborative features |

## Success Metrics

- **Adoption**: 1000+ downloads by v1.0
- **Performance**: <1s query execution for 95% of user queries
- **Reliability**: 99.9% uptime for all database connections (no crashes)
- **Quality**: 90%+ code coverage on core business logic
- **Community**: 10+ community-contributed plugins by v1.0

## License & Legal

- **License**: GNU Affero General Public License v3.0 (AGPLv3)
- **CLA**: Required for contributions
- **Sponsors**: Dwarves Foundation, Nimbus, Huy TQ, Unikorn
- **Distribution**: GitHub Releases (DMG for macOS, MSI for Windows)

---

**Last Updated**: 2026-03-13 | **Version**: 0.17.0 | **Next Review**: Phase 2 completion (v0.20)
