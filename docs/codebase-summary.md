# TablePro Codebase Summary

## Repository Structure

```
TablePro/
├── TablePro/              # macOS Swift codebase (read-only reference, ~200 files)
├── Plugins/               # macOS plugin system (driver bundles, export/import)
├── tablepro-windows/      # Windows Tauri v2 app (ACTIVE DEVELOPMENT)
├── Libs/                  # Shared Swift libraries (ReadabilityKit, etc.)
├── docs/                  # Mintlify documentation (features, databases, development)
├── plans/                 # Implementation plans and phase documents
├── scripts/               # Build & CI scripts (Python, Bash)
├── CHANGELOG.md           # Release notes and unreleased changes
├── AGENTS.md              # Development guidelines and workflows
└── README.md              # Root project overview
```

## macOS Codebase (TablePro/)

**Status**: Stable (v0.17.0) | **Architecture**: SwiftUI + AppKit | **Files**: ~200 (Swift)

### Directory Layout

```
TablePro/
├── TableProApp.swift          # Main app entry, SwiftUI scenes
├── AppDelegate.swift          # Window lifecycle, file open handlers
├── Core/
│   ├── Database/              # DatabaseDriver protocol, connection management
│   ├── Plugins/               # PluginManager, code signature verification
│   ├── ChangeTracking/        # Cell edit recording, SQL generation
│   ├── SSH/                   # SSH tunnel connections
│   ├── Autocomplete/          # SQL keyword & schema autocompletion
│   ├── Storage/               # Connections, settings, history persistence
│   ├── Models/                # Shared data structures
│   └── Services/              # Business logic (queries, updates, exports)
├── Models/                    # Data models (~15 files: Connection, QueryResult, etc.)
├── ViewModels/                # State management (Sidebar, DatabaseSwitcher, etc.)
├── Views/                     # UI components (~40+ files)
│   ├── Main/                  # Main window, sidebar + editor + grid
│   ├── Editor/                # SQL editor, result display
│   ├── DataGrid/              # Table view with editing
│   ├── Connection/            # Connection dialogs
│   ├── Settings/              # User preferences
│   └── Components/            # Reusable UI widgets
└── Resources/                 # Icons, strings, localization
```

### Key macOS Patterns

| Component | Implementation | Notes |
|-----------|-----------------|-------|
| **UI Framework** | SwiftUI + AppKit (hybrid) | SwiftUI for modern views, AppKit for window chrome |
| **State** | @Observable (Swift 5.9+) | Replaces @StateObject, cleaner syntax |
| **Async** | async/await, Task | Non-blocking database operations |
| **Database Access** | DatabaseDriver protocol | Polymorphic async interface for all drivers |
| **Storage** | UserDefaults + custom JSON | Settings via UserDefaults, history via Core Data |
| **Passwords** | macOS Keychain | Secure credential storage |
| **Plugins** | .tableplugin bundles | Code-signed, loaded via Bundle API |

### Core Protocols (reference for Windows)

```swift
protocol DatabaseDriver {
  func execute(sql: String) async throws -> QueryResult
  func getTableStructure(name: String) async throws -> TableInfo
  func insert(table: String, rows: [[String: Any]]) async throws
  func update(table: String, changes: [Change]) async throws
  func delete(table: String, condition: String) async throws
}

protocol PluginDatabaseDriver: PluginInterface {
  func instantiate() -> DatabaseDriver
}
```

## Windows Codebase (tablepro-windows/)

**Status**: Phase 6 Complete (v0.18 unreleased) | **Architecture**: Tauri v2 + Rust + React | **Files**: ~90 source files, ~12,700 LOC

### Directory Layout

```
tablepro-windows/
├── src-tauri/                 # Rust backend (src/, src-tauri/Cargo.toml workspace)
│   ├── src/
│   │   ├── main.rs            # App entry, Tauri builder with IPC commands
│   │   ├── lib.rs             # Library root
│   │   ├── commands/           # IPC handlers (8 modules: connection, query, schema, data, export, settings, storage, mod)
│   │   ├── services/           # ConnectionManager, QueryExecutor, SchemaLoader
│   │   ├── plugin/             # DLL loading (manager.rs, adapter.rs, driver_trait.rs)
│   │   ├── models/             # Rust data structures (Connection, QueryResult, etc.)
│   │   ├── storage/            # ConnectionStore (JSON), SettingsStore (JSON)
│   │   ├── error.rs            # TauriError wrapper for type-safe IPC
│   │   └── utils/              # Helpers (password encryption, logging)
│   ├── driver-postgres/        # PostgreSQL plugin (cdylib crate)
│   ├── driver-mysql/           # MySQL plugin (cdylib crate)
│   ├── driver-mssql/           # SQL Server plugin (cdylib crate)
│   ├── plugin-sdk/             # FFI types shared between host & plugins
│   ├── Cargo.toml             # Workspace manifest with all crates
│   └── gen/                   # Tauri-generated bindings
├── src/                       # React/TypeScript frontend (~50 components, ~7,246 LOC)
│   ├── components/            # React components (Layout, Connection, Grid, Editor, etc.)
│   │   ├── connection/        # Connection dialogs
│   │   ├── editor/            # SQL editor with autocomplete
│   │   ├── export/            # Export dialog
│   │   ├── grid/              # Data grid with virtual scrolling
│   │   ├── history/           # Query history panel
│   │   ├── layout/            # Main layout, sidebar, toolbar
│   │   ├── settings/          # Settings panels
│   │   ├── shared/            # Reusable UI components
│   │   └── structure/         # Table structure viewer
│   ├── stores/                # Zustand stores (7 stores, ~1,600 LOC total)
│   │   ├── connection-store.ts
│   │   ├── query-store.ts
│   │   ├── schema-store.ts
│   │   ├── change-store.ts    # Change tracking with undo/redo
│   │   ├── tab-store.ts
│   │   ├── editor-store.ts
│   │   └── history-store.ts
│   ├── editor/                # SQL editor modules (9 files, ~1,600 LOC)
│   │   ├── sql-context-analyzer.ts
│   │   ├── sql-completion-provider.ts
│   │   ├── sql-keywords.ts
│   │   ├── statement-scanner.ts
│   │   └── vim-mode.ts
│   ├── hooks/                 # Custom React hooks (5 files)
│   ├── ipc/                   # Typed Tauri command wrappers
│   ├── types/                 # TypeScript interfaces (mirror Rust models)
│   ├── App.tsx                # Root component
│   ├── main.tsx               # Vite entry point
│   └── styles/                # Tailwind CSS
├── __tests__/                 # Test suite (4 test files, ~284 LOC)
├── package.json               # Node.js dependencies (React, Zustand, TailwindCSS, @tauri-apps/api)
├── vite.config.ts             # Vite bundler config
├── tsconfig.json              # Strict TypeScript settings
└── tailwind.config.js         # TailwindCSS customization
```

### Windows Architecture

```
┌─────────────────────────────────────────────────────────┐
│ React/TypeScript Frontend (Chromium window)             │
│ ├─ Components (Grid, Editor, Sidebar, Connection)      │
│ │  └─ Quick Switcher, History Panel, Export Dialog    │
│ ├─ Zustand Stores (connection, query, schema, change)  │
│ └─ IPC layer (typed Tauri invokes)                      │
└──────────────┬──────────────────────────────────────────┘
               │ Tauri IPC (JSON messages)
┌──────────────▼──────────────────────────────────────────┐
│ Rust Backend (tokio async runtime)                      │
│ ├─ IPC Commands (execute_query, get_schema, etc.)      │
│ ├─ Services (ConnectionManager, QueryExecutor)         │
│ ├─ Plugin System (load DLL → DatabaseDriver trait)     │
│ ├─ Storage (DPAPI passwords, JSON settings/tabs)       │
│ └─ Models (Connection, QueryResult, TableInfo, etc.)   │
└──────────────┬──────────────────────────────────────────┘
               │ C ABI FFI
┌──────────────▼──────────────────────────────────────────┐
│ Plugin DLLs (per database)                              │
│ ├─ driver-postgres.dll (PostgreSQL driver)             │
│ ├─ driver-mysql.dll (MySQL driver)                     │
│ ├─ driver-mssql.dll (SQL Server driver)                │
│ └─ (other database drivers)                            │
└──────────────┬──────────────────────────────────────────┘
               │ SQL / native protocol
               └──────> Database (MySQL, PostgreSQL, etc.)
```

### Key Windows Patterns

| Component | Implementation | Notes |
|-----------|-----------------|-------|
| **IPC Layer** | Tauri v2 commands | Typed invoke wrapper in `ipc/` folder |
| **Error Handling** | TauriError enum + type conversion | Never panic, always return user-friendly errors |
| **State Management** | Zustand (reactive stores) | Separate stores: connection, query, schema, change, tab, editor |
| **Async Runtime** | tokio (Rust) | Non-blocking queries via tasks |
| **Database Drivers** | C ABI FFI (libloading) | Load .dll plugins at runtime, call via vtable |
| **Password Storage** | DPAPI (Windows Crypto API) | Via `dpapi-rs` crate or FFI wrapper |
| **Storage** | APPDATA JSON + SQLite | Settings/connections/tabs as JSON, history as SQLite FTS5 |
| **Logging** | `tracing` crate | Structured logging, never `println!()` |

## Plugin System (Both Platforms)

### Plugin Discovery & Loading

**macOS**:
```
1. App finds .tableplugin bundles in ~/Library/Application Support/TablePro/Plugins/
2. Loads bundle via Bundle(url:) API
3. Instantiates plugin class (code signature verified)
4. Plugin registers drivers, exporters, importers
```

**Windows**:
```
1. App finds .dll files in %APPDATA%/TablePro/Plugins/
2. PluginManager uses libloading to load DLL
3. Calls PluginVTable::new_driver() function pointer
4. FFI→Rust adapter wraps plugin in DatabaseDriver trait
```

### Plugin Crates (Windows)

Each database driver is a separate Rust crate compiled as `cdylib` in the `src-tauri/` workspace:

**Available Drivers** (Phase 2 complete):
- driver-postgres: PostgreSQL via tokio-postgres (~400 LOC per driver, average)
- driver-mysql: MySQL via mysql_async
- driver-mssql: SQL Server via tiberius

**Future Drivers** (planned in Phase 3):
- MongoDB, Redis, Oracle, ClickHouse, DuckDB

**Structure**:
```
driver-postgres/
├── Cargo.toml                # crate-type = ["cdylib"]
├── src/lib.rs                # FFI entry point, plugin_new() function
└── src/driver.rs             # Implements DatabaseDriver trait
```

### Plugin Interfaces

**macOS**: Swift protocols (`PluginDatabaseDriver`, `ExportFormatPlugin`, `ImportFormatPlugin`)

**Windows**: C vtable with function pointers:
```c
struct PluginVTable {
  fn new_driver() -> *mut DatabaseDriver,
  fn api_version() -> u32,
  fn driver_name() -> *const c_char,
  ...
}
```

## Shared Data Models

| Model | Purpose | Fields |
|-------|---------|--------|
| **Connection** | Database connection config | host, port, user, password, database, sslConfig, sshConfig |
| **QueryResult** | Execution result | columns (ColumnInfo[]), rows (Any[][]), rowCount |
| **ColumnInfo** | Column metadata | name, type, nullable, isPrimaryKey, isForeignKey |
| **TableInfo** | Table structure | name, columns (ColumnInfo[]), indexes, primaryKey, foreignKeys |
| **Change** | Cell edit record | table, primaryKey, column, oldValue, newValue |

All models are defined separately in each platform's codebase but follow consistent semantics.

## Build Systems & Dependencies

### macOS Build
- **Tool**: Xcode 15.2+
- **Language**: Swift 5.9+
- **Dependencies**: Third-party Swift packages (SPM)
- **Output**: .app bundle (notarized for distribution)

### Windows Build
- **Backend**: `cargo build --release` (Rust 1.75+)
- **Frontend**: `npm run build` (Node.js 18+)
- **Bundler**: Vite + TailwindCSS
- **Tauri**: v2 (generates IPC bindings)
- **Output**: MSI installer (NSIS), code-signed executable

### Dependency Highlights

**Rust**:
- `tauri` v2: Desktop framework, IPC, file dialogs
- `tokio`: Async runtime
- `serde/serde_json`: Serialization
- `libloading`: Dynamic library loading for plugins
- `tracing`: Structured logging
- `sqlparser`: SQL parsing for schema inference

**TypeScript/React**:
- `@tauri-apps/api`: Tauri IPC wrapper
- `zustand`: State management
- `@codemirror/lang-sql`: SQL syntax highlighting + editor
- `@replit/codemirror-vim`: Vim keybindings
- `lucide-react`: UI icons
- `tailwindcss`: Utility-first CSS

## Storage Implementation

### macOS
- **Connections**: UserDefaults (user domain)
- **Query History**: Core Data (NSPersistentContainer)
- **Tab State**: JSON in ~/Library/Application Support/TablePro/
- **Passwords**: macOS Keychain (automatic decryption)

### Windows
- **Connections**: `%APPDATA%/TablePro/connections.json` (encrypted passwords)
- **Query History**: `%APPDATA%/TablePro/history.db` (SQLite FTS5)
- **Tab State**: `%APPDATA%/TablePro/tabs/{tabId}.json` (per-tab JSON)
- **Settings**: `%APPDATA%/TablePro/settings.json`
- **Passwords**: DPAPI-encrypted (CryptProtectData)

## Code Quality Standards

### Rust
- **Linting**: `cargo clippy` (no warnings in release builds)
- **Formatting**: `rustfmt` (enforced via pre-commit)
- **Error Handling**: No `unwrap()` on user data; always `Result<T, E>`
- **Logging**: `tracing` crate with spans and events
- **FFI**: All external types marked `#[repr(C)]`

### TypeScript
- **Linting**: ESLint + Prettier
- **Type Checking**: `strict: true` in tsconfig.json
- **Error Handling**: type-safe error boundaries
- **State**: Zustand for centralized store
- **Components**: Functional with hooks, no class components

### Swift
- **Linting**: swiftlint (enforced via Xcode build phase)
- **Formatting**: swiftformat
- **Async**: async/await (no Combine)
- **Error**: Swift.Error protocol, no force unwrap in production

## Testing Strategy

| Layer | Tool | Coverage | Status |
|-------|------|----------|--------|
| **Unit (Rust)** | cargo test | Database models, SQL generation, utils | 30+ tests |
| **Unit (TS)** | Vitest | React components, stores, IPC layer | 30+ tests |
| **Integration** | Tauri E2E | IPC round-trips, plugin loading | Included |
| **E2E** | Playwright | User workflows (edit, execute, export) | Ready for Phase 3 |

---

**Last Updated**: 2026-03-13 | **Stable Release**: v0.17.0 | **Windows Branch**: In Progress
