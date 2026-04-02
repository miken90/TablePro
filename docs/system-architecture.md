# TablePro System Architecture

## 1. Scope and source of truth

This document describes architecture reflected in current repository code, focused on the active Windows implementation under `tablepro-windows/`.

Primary verified sources:

- `tablepro-windows/src-tauri/src/lib.rs`
- `tablepro-windows/src-tauri/src/plugin/manager.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter.rs`
- `tablepro-windows/src-tauri/src/services/connection_manager.rs`
- `tablepro-windows/src-tauri/src/services/health_monitor.rs`
- `tablepro-windows/src-tauri/src/commands/query.rs`
- `tablepro-windows/src-tauri/src/commands/connection.rs`
- Frontend stores/components under `tablepro-windows/src/`

## 2. High-level system view

```text
React frontend
  -> Typed IPC wrappers (`src/ipc/commands.ts`)
  -> Tauri invoke boundary
Rust backend (`src-tauri/src/commands/*`)
  -> ConnectionManager (session registry)
  -> HealthMonitor (periodic ping + lost/reconnected signaling)
  -> DatabaseDriver trait objects
  -> PluginDriverAdapter (FFI bridge)
Plugin DLLs (driver crates)
  -> Native DB protocols
External databases
```

## 3. Windows runtime architecture

### 3.1 Tauri application composition

`src-tauri/src/lib.rs` wires runtime state with Tauri `manage(...)` and command registration.

Managed state includes:

- `Mutex<ConnectionManager>`
- `Mutex<HealthMonitor>`
- `Mutex<SettingsStore>`
- `Mutex<ConnectionStore>`
- `Mutex<HistoryStore>`
- `Mutex<FilterStore>`
- `Mutex<AiChatStore>`
- `Mutex<AiCancelState>`

Command registration includes connection/query/schema/storage/history/import/export/filter/settings/structure/data and AI flows.

### 3.2 Session-oriented backend flow

Connection lifecycle is session-based:

1. Frontend sends `connect(config)`
2. Backend opens driver and returns `session_id`
3. Frontend stores `savedConnectionId -> session_id`
4. Query/schema/data commands use `session_id`
5. `disconnect(session_id)` closes runtime session

This is implemented across:

- `commands/connection.rs`
- `services/connection_manager.rs`
- `stores/connectionStore.ts`

### 3.3 Health monitor and reconnect flow

- On successful connect (except SQLite), backend starts monitor task (`services/health_monitor.rs`)
- Monitor pings driver every 30 seconds
- Ping failure emits `connection:lost` event and marks session status as failed
- Frontend listens for `connection:lost` and offers reconnect
- `reconnect_session(session_id)` recreates connection and emits `connection:reconnected`

### 3.4 Auto-updater

- Tauri updater plugin is registered in non-dev builds (`#[cfg(not(feature = "devtools"))]`)
- Frontend hook `useAutoUpdater.ts` checks update metadata via updater plugin APIs
- Update check is throttled to once every 4 hours using localStorage key `tablepro:last-update-check`

### 3.5 Async I/O patterns

File I/O and SQLite operations are moved off the async runtime via `spawn_blocking` or `block_in_place` wrappers, including in export/import and storage modules.

## 4. Plugin subsystem architecture

### 4.1 Discovery and loading

`PluginManager` scans DLLs from:

1. executable-adjacent `plugins/` directory (primary)
2. executable directory fallback (dev scenario), filtered to `driver_*` / `driver-*`

### 4.2 ABI handshake

Current host/plugin ABI flow:

1. Host allocates `PluginVTable`
2. Host loads and calls `tablepro_plugin_init(vtable_ptr)`
3. Host checks `vtable.api_version == API_VERSION`
4. Host reads plugin identity from `tablepro_plugin_metadata`
5. Host keeps DLL loaded while plugin is active

### 4.3 Driver instantiation and FFI bridge

For each connection, host creates a driver via:

- `PluginManager::create_driver(type_id, config)`
- `PluginDriverAdapter::new(vtable, config, type_id)`

`PluginDriverAdapter`:

- owns plugin `DriverHandle`
- implements `DatabaseDriver`
- converts FFI payloads to Rust models
- uses `catch_unwind` in FFI paths where needed
- destroys handle in `Drop` via plugin vtable destructor

## 5. Query and table-browse execution path

### 5.1 Query execution (`execute_query`)

`commands/query.rs` flow:

1. Resolve driver clone from `ConnectionManager` by `session_id`
2. Emit `query:started`
3. Start periodic `query:progress` event timer
4. Execute SQL asynchronously through driver
5. Emit `query:completed` or `query:error`
6. Return `QueryResult` or `AppError`

### 5.2 Paginated browse (`fetch_rows`, `fetch_count`)

- Qualified table name built from `table` + optional `schema`
- Optional `where_clause` is validated with basic safety guards
- `LIMIT/OFFSET` pagination is applied in generated SQL

### 5.3 Query cancellation

`cancel_query(session_id)` routes to driver `cancel_query()`.

## 6. Frontend architecture highlights

### 6.1 State model (Zustand stores)

Key stores:

- `connectionStore`: saved connection map, status map, `sessionIds`, reconnect action
- `queryStore`: run/cancel flow, result/error state
- `schemaStore`: tables/columns/indexes/foreign keys/routines metadata state
- `changeStore`: staged edits before `save_changes`
- `editorStore`: tab persistence (`tablepro-editor-tabs`), preview tab support
- `filterStore`: filter conditions and presets
- `history.ts`: recent/search/delete/clear history state
- `settingsStore`: app settings state
- `aiStore`: AI provider/model/settings/conversation UI state

### 6.2 Main UI composition

`MainLayout.tsx` integrates sidebar, query editor, results grid, filter panel, inspector, history panel, and settings/quick-switcher flows.

## 7. Persistence architecture

### 7.1 Backend files

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- History: `data_dir/TablePro/history.sqlite3`
- AI chat: `data_dir/TablePro/ai_chat.sqlite3`

### 7.2 History database

`HistoryStore` initializes:

- `history` table
- `history_fts` FTS5 virtual table (`content=history`)
- triggers to keep FTS index in sync

### 7.3 Frontend persistence

- Editor tabs persist in localStorage key `tablepro-editor-tabs`
- Update check throttling timestamp persists in localStorage key `tablepro:last-update-check`

### 7.4 Credential security

Connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are encrypted at rest using Windows DPAPI (`services/credential_store.rs`) and stored with `dpapi:` prefix in `connections.json`. Legacy plaintext values are auto-migrated on save.

## 8. Error handling and observability

- Backend commands return `Result<_, AppError>`
- Runtime logs use `tracing`
- Panic hook and tracing subscriber are initialized in `lib.rs`
- Renderer error reporting command exists: `log_renderer_error`

## 9. Lifecycle and ownership constraints

- `ConnectionManager` retains active drivers keyed by session
- `HealthMonitor` owns monitor tasks and must be stopped on disconnect/shutdown
- `PluginManager` reclaims vtable allocations and unloads libraries in `Drop`

## 10. Architectural stale-risk checkpoints

Re-verify these files when updating architecture docs:

1. `src-tauri/src/lib.rs` (managed state, command registration)
2. `src-tauri/src/plugin/manager.rs` (ABI and discovery)
3. `src-tauri/src/commands/query.rs` and `commands/connection.rs` (runtime flow)
4. `src-tauri/src/storage/*.rs` and frontend stores (persistence/security claims)

---

**Last Updated**: 2026-04-02  
**Architecture focus**: Active Windows runtime + plugin/session/AI/health flows
