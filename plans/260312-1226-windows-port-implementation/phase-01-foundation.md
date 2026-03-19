# Phase 1: Foundation & Scaffolding

**Duration:** 3 weeks | **Team:** Dev 1 (Rust) + Dev 2 (Frontend)
**Gate:** Tauri app boots on Windows, IPC round-trip works, empty shell renders

## Context

Existing `tablepro-windows/` has a skeleton with Monaco editor (React + Zustand). We're replacing Monaco with CodeMirror 6 and restructuring for the full port. The existing skeleton has React + Zustand already wired.

## Architecture Boundaries

```
tablepro-windows/
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs               # Tauri bootstrap
│   │   ├── lib.rs                 # App setup, plugin registration
│   │   ├── commands/              # IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs      # connect/disconnect/test
│   │   │   ├── query.rs           # execute/fetch/cancel
│   │   │   ├── schema.rs          # tables/columns/indexes
│   │   │   ├── settings.rs        # app settings CRUD
│   │   │   └── export.rs          # export/import
│   │   ├── services/              # Business logic
│   │   │   ├── mod.rs
│   │   │   ├── connection_manager.rs
│   │   │   ├── query_executor.rs
│   │   │   ├── change_tracker.rs
│   │   │   ├── sql_generator.rs
│   │   │   └── health_monitor.rs
│   │   ├── storage/               # Persistence
│   │   │   ├── mod.rs
│   │   │   ├── connection_store.rs # JSON file + DPAPI for passwords
│   │   │   ├── settings_store.rs   # JSON config file
│   │   │   ├── history_store.rs    # SQLite + FTS5
│   │   │   └── tab_state_store.rs
│   │   ├── plugin/                # Driver plugin system
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs         # Plugin discovery & loading
│   │   │   ├── driver_trait.rs    # DatabaseDriver trait (FFI-safe)
│   │   │   ├── adapter.rs         # FFI → trait adapter
│   │   │   └── models.rs          # QueryResult, ColumnInfo, etc.
│   │   ├── models/                # Shared data types
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs
│   │   │   ├── query.rs
│   │   │   ├── schema.rs
│   │   │   └── error.rs
│   │   └── util/
│   │       ├── sql_escape.rs
│   │       └── sql_scanner.rs
│   └── plugins/                   # Driver DLL source (separate crates)
│       ├── driver-postgres/
│       ├── driver-mysql/
│       └── driver-mssql/
├── src/                           # TypeScript frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MainLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Toolbar.tsx
│   │   ├── editor/
│   │   │   ├── SqlEditor.tsx       # CodeMirror 6 wrapper
│   │   │   ├── EditorTabBar.tsx
│   │   │   └── VimIndicator.tsx
│   │   ├── grid/
│   │   │   ├── DataGrid.tsx        # Virtualized table
│   │   │   ├── CellEditor.tsx
│   │   │   └── ColumnHeader.tsx
│   │   ├── connection/
│   │   │   ├── ConnectionForm.tsx
│   │   │   └── WelcomeView.tsx
│   │   ├── filter/
│   │   │   └── FilterPanel.tsx
│   │   └── shared/
│   │       ├── Pagination.tsx
│   │       └── EmptyState.tsx
│   ├── stores/                    # Zustand stores
│   │   ├── connectionStore.ts
│   │   ├── queryStore.ts
│   │   ├── schemaStore.ts
│   │   ├── settingsStore.ts
│   │   └── editorStore.ts
│   ├── hooks/
│   │   ├── useDatabase.ts
│   │   ├── useQuery.ts
│   │   └── useIpc.ts
│   ├── ipc/                       # Tauri IPC bindings
│   │   ├── commands.ts            # Type-safe invoke wrappers
│   │   └── events.ts             # Event listeners
│   ├── types/                     # Shared TypeScript types
│   │   ├── connection.ts
│   │   ├── query.ts
│   │   ├── schema.ts
│   │   └── settings.ts
│   └── styles/
│       ├── globals.css
│       └── theme.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## IPC Contract (Rust ↔ TypeScript)

All communication via Tauri `invoke()`. JSON serialization via serde.

```typescript
// Key IPC commands — mirrors DatabaseDriver protocol
type IpcCommands = {
  // Connection
  'connection:test': (config: ConnectionConfig) => Promise<boolean>;
  'connection:connect': (config: ConnectionConfig) => Promise<string>; // returns connection_id
  'connection:disconnect': (connectionId: string) => Promise<void>;

  // Query
  'query:execute': (connId: string, sql: string) => Promise<QueryResult>;
  'query:fetch_rows': (connId: string, sql: string, offset: number, limit: number) => Promise<QueryResult>;
  'query:fetch_count': (connId: string, sql: string) => Promise<number>;
  'query:cancel': (connId: string) => Promise<void>;

  // Schema
  'schema:tables': (connId: string) => Promise<TableInfo[]>;
  'schema:columns': (connId: string, table: string) => Promise<ColumnInfo[]>;
  'schema:indexes': (connId: string, table: string) => Promise<IndexInfo[]>;
  'schema:foreign_keys': (connId: string, table: string) => Promise<ForeignKeyInfo[]>;
  'schema:databases': (connId: string) => Promise<string[]>;
  'schema:ddl': (connId: string, table: string) => Promise<string>;

  // CRUD
  'data:save_changes': (connId: string, changes: RowChange[]) => Promise<SaveResult>;
  'data:begin_transaction': (connId: string) => Promise<void>;
  'data:commit': (connId: string) => Promise<void>;
  'data:rollback': (connId: string) => Promise<void>;

  // Storage
  'settings:get': () => Promise<AppSettings>;
  'settings:set': (settings: AppSettings) => Promise<void>;
  'connections:list': () => Promise<SavedConnection[]>;
  'connections:save': (conn: SavedConnection) => Promise<void>;
  'connections:delete': (id: string) => Promise<void>;
  'history:search': (query: string, filter: DateFilter) => Promise<HistoryEntry[]>;
};
```

## Implementation Steps

### Week 1: Scaffold

- [ ] Init Tauri v2 project in `tablepro-windows/` (preserve existing React setup)
- [ ] Configure `tauri.conf.json`: window title, min size (1024x600), WebView2 requirement
- [ ] Set up Cargo workspace: main crate + `plugin-sdk` crate (shared types)
- [ ] Rust: Create `commands/` module stubs for all IPC endpoints
- [ ] Rust: Create `models/` with serde-serializable types matching macOS `DatabaseConnection`, `QueryResult`, `ColumnInfo`, `TableInfo`, `IndexInfo`, `ForeignKeyInfo`
- [ ] TypeScript: Set up Vite + React + TypeScript + Tailwind CSS
- [ ] TypeScript: Create `ipc/commands.ts` with typed invoke wrappers
- [ ] TypeScript: Create Zustand stores skeleton
- [ ] Verify: `npm run tauri dev` opens window with "Hello World" on Windows

### Week 2: Layout Shell

- [ ] TypeScript: `MainLayout.tsx` — 3-panel resizable (sidebar | editor+grid | right panel)
- [ ] TypeScript: `Sidebar.tsx` — tree view placeholder (database → tables → columns)
- [ ] TypeScript: `Toolbar.tsx` — connection status, run button, stop button
- [ ] TypeScript: `EditorTabBar.tsx` — tab bar with add/close/reorder
- [ ] TypeScript: `WelcomeView.tsx` — connection list (empty state)
- [ ] TypeScript: `ConnectionForm.tsx` — host/port/user/pass/database/SSL fields
- [ ] Rust: `settings_store.rs` — JSON file read/write in `%APPDATA%/TablePro/`
- [ ] Rust: `connection_store.rs` — JSON + Windows DPAPI for password encryption
- [ ] Wire: Settings round-trip (TS → Rust → disk → Rust → TS)

### Week 3: IPC Plumbing & Benchmark Gate

- [ ] Rust: Connection manager skeleton (HashMap<Uuid, Box<dyn DatabaseDriver>>)
- [ ] Rust: Implement mock driver that returns fake data (for frontend dev)
- [ ] TypeScript: Wire ConnectionForm → `connection:test` → show success/error
- [ ] TypeScript: Wire Sidebar → `schema:tables` → render tree
- [ ] TypeScript: Wire query execution flow (editor → execute → render results placeholder)
- [ ] **BENCHMARK**: Cold start < 3s, idle RAM < 150 MB
- [ ] Set up CI: GitHub Actions Windows runner, `cargo build + npm build + tauri build`

## Rust Storage: Windows Equivalents

| macOS | Windows | Crate |
|-------|---------|-------|
| Keychain | DPAPI (`CryptProtectData`) | `windows` crate |
| UserDefaults | JSON in `%APPDATA%/TablePro/settings.json` | `serde_json` + `dirs` |
| SQLite (history) | Same — SQLite via `rusqlite` | `rusqlite` with FTS5 |
| Tab state JSON | Same — JSON in `%APPDATA%/TablePro/tabs/` | `serde_json` |

## Success Criteria

1. App launches on Windows 10/11 via `tauri dev`
2. Connection form renders and sends IPC to Rust
3. Mock data flows from Rust → TypeScript → renders in placeholder grid
4. Settings persist across app restart
5. Cold start < 3s, idle RAM < 150 MB
