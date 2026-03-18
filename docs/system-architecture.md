# TablePro System Architecture

## 1. Scope and source of truth

This document describes architecture reflected in current repository code, with emphasis on the active Windows implementation under `tablepro-windows/`.

Primary verified sources:

- `tablepro-windows/src-tauri/src/lib.rs`
- `tablepro-windows/src-tauri/src/plugin/manager.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter.rs`
- `tablepro-windows/src-tauri/src/services/connection_manager.rs`
- `tablepro-windows/src-tauri/src/commands/query.rs`
- Frontend stores/components under `tablepro-windows/src/`

## 2. High-level system view

```text
React (frontend UI)
  -> Typed IPC wrappers (`src/ipc/commands.ts`)
  -> Tauri invoke boundary
Rust backend (`src-tauri/src/commands/*`)
  -> ConnectionManager (session registry)
  -> DatabaseDriver trait objects
  -> PluginDriverAdapter (FFI bridge)
Plugin DLLs (driver crates)
  -> Native DB protocols
External databases
```

## 3. Windows runtime architecture

### 3.1 Tauri application composition

`src-tauri/src/lib.rs` wires runtime state with Tauri `manage(...)` and command handler registration.

Managed state includes:

- `Mutex<ConnectionManager>`
- `Mutex<SettingsStore>`
- `Mutex<ConnectionStore>`
- `Mutex<HistoryStore>`

Command registration includes connection, query, schema, storage, history, import/export, settings, and save-changes flows.

### 3.3 Async I/O patterns

All file I/O and SQLite operations are wrapped with `tokio::task::spawn_blocking` or `block_in_place` to avoid blocking the async runtime:

- `commands/export.rs` — file creation and write via `spawn_blocking`
- `commands/import.rs` — file preview via `spawn_blocking`
- `storage/connection_store.rs`, `storage/settings_store.rs` — `run_blocking_io` wrapper
- `storage/history_store.rs` — `run_blocking_db` using `block_in_place`

### 3.2 Session-oriented backend flow

Connection lifecycle is session-based:

1. Frontend sends `connect(config)`
2. Backend creates driver and opens connection
3. Backend returns `session_id` (UUID string)
4. Frontend stores mapping `savedConnectionId -> session_id`
5. Subsequent query/schema/data commands use `session_id`

This is implemented across:

- `commands/connection.rs`
- `services/connection_manager.rs`
- `stores/connectionStore.ts`

## 4. Plugin subsystem architecture

### 4.1 Discovery and loading

`PluginManager` scans DLLs from:

1. executable-adjacent `plugins/` directory (primary)
2. executable directory fallback (dev scenario), filtered to `driver_*` or `driver-*`

### 4.2 ABI handshake

Current host/plugin ABI flow:

1. Host allocates uninitialized `PluginVTable`
2. Host loads `tablepro_plugin_init` symbol and calls it with vtable pointer
3. Host verifies `vtable.api_version == API_VERSION`
4. Host reads plugin identity from `tablepro_plugin_metadata`
5. Host keeps DLL loaded while plugin is active

This replaces older docs that referenced `plugin_new` entrypoint for host startup.

### 4.3 Driver instantiation and FFI bridging

For each connection, host creates a driver via:

- `PluginManager::create_driver(type_id, config)`
- `PluginDriverAdapter::new(vtable, config, type_id)`

`PluginDriverAdapter` (split into `adapter.rs` + `adapter_ffi_helpers.rs` + `adapter_ffi_list_converters.rs`):

- owns plugin `DriverHandle`
- implements `DatabaseDriver` trait
- converts FFI structs/results into Rust models
- uses `catch_unwind` around FFI calls in multiple paths
- destroys handle in `Drop` via plugin vtable destructor

## 5. Query and table-browse execution path

### 5.1 Query execution (`execute_query`)

`commands/query.rs` flow:

1. Lock `ConnectionManager` mutex
2. Resolve driver clone for `session_id`
3. Release manager lock
4. Execute SQL async via driver
5. Return `QueryResult` or `AppError`

### 5.2 Paginated browse (`fetch_rows`, `fetch_count`)

- Qualified table names are generated from `table` + optional `schema`
- Optional `where_clause` passes basic guard (`;`, `--`, and destructive keywords blocked)
- `LIMIT/OFFSET` pagination is applied in generated SQL

### 5.3 Query cancellation

`cancel_query(session_id)` routes to driver `cancel_query()`.

## 6. Frontend architecture highlights

### 6.1 State model (Zustand stores)

Key stores:

- `connectionStore`: saved connection map, statuses, `sessionIds` map
- `queryStore`: run/cancel flow, safe-mode checks, query result/error state
- `schemaStore`: schema metadata fetch state (tables/columns/etc.)
- `changeStore`: staged edits for save workflow
- `editorStore`: tab persistence via Zustand `persist`
- `history.ts`: recent/search/delete/clear history state
- `settingsStore`: app settings load/save state

### 6.2 Main UI composition

`MainLayout.tsx` integrates:

- sidebar and toolbar
- query editor and results panel
- table-browse mode
- filter panel
- inspector panel
- history panel
- quick switcher and settings

Keyboard shortcuts include toggles for quick switcher, settings, filter, inspector, and history.

## 7. Persistence architecture (current implemented state)

### 7.1 Backend files

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- History: `data_dir/TablePro/history.sqlite3`

### 7.2 History database structure

`HistoryStore` initializes:

- `history` table
- FTS5 table `history_fts` with `content=history`
- insert/delete triggers to keep FTS index in sync

### 7.3 Frontend persistence

Editor tabs are persisted in browser storage via Zustand middleware key:

- `tablepro-editor-tabs`

### 7.4 Credential security

Connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are encrypted at rest using Windows DPAPI via `services/credential_store.rs`:

- Save path: passwords are encrypted and stored with `dpapi:` prefix in `connections.json`
- Load path: `dpapi:`-prefixed values are decrypted; legacy plaintext values are auto-migrated on next save
- Dependencies: `windows-dpapi` crate + `base64` for encoding

## 8. Error handling and observability

- Backend command signatures return `Result<_, AppError>`
- Runtime logs use `tracing`
- App startup configures panic hook and tracing subscriber in `lib.rs`
- Renderer error reporting command exists: `log_renderer_error`

## 9. Lifecycle and ownership constraints

- `ConnectionManager` retains active driver instances keyed by session
- Drivers should be dropped before plugin manager unloads DLL/vtable state
- `PluginManager` `Drop` reclaims vtable allocations and then unloads libraries

## 10. Architectural stale-risk checkpoints

Review these files when architecture docs are updated:

1. `src-tauri/src/lib.rs` (registered commands, managed state)
2. `src-tauri/src/plugin/manager.rs` (ABI/discovery behavior)
3. `src-tauri/src/commands/query.rs` (parameters and query safeguards)
4. `src-tauri/src/storage/connection_store.rs` + frontend stores (persistence/security claims)

---

**Last Updated**: 2026-03-18  
**Architecture focus**: Windows active runtime + plugin/session flow