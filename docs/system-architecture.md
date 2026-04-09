# TablePro System Architecture

## 1. Scope and source of truth

This document describes architecture reflected in current repository code as of 2026-04-08, focused on the active Windows implementation under `tablepro-windows/`.

Primary verified sources:

- `tablepro-windows/src-tauri/src/lib.rs`
- `tablepro-windows/src-tauri/src/plugin/manager.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter.rs`
- `tablepro-windows/src-tauri/src/services/connection_manager.rs`
- `tablepro-windows/src-tauri/src/services/health_monitor.rs`
- `tablepro-windows/src-tauri/src/commands/query.rs`
- `tablepro-windows/src-tauri/src/commands/connection.rs`
- `tablepro-windows/src-tauri/src/commands/tab_state.rs`
- `tablepro-windows/src-tauri/src/storage/tab_state_store.rs`
- `tablepro-windows/src-tauri/src/models/capability.rs`
- `tablepro-windows/src-tauri/driver-mongodb/`
- `tablepro-windows/src-tauri/driver-redis/`
- `tablepro-windows/src-tauri/driver-capabilities/`
- `tablepro-windows/src-tauri/src/commands/explain.rs`
- `tablepro-windows/src-tauri/src/commands/bulk_ops.rs`
- `tablepro-windows/src-tauri/src/commands/routine_ops.rs`
- Frontend stores/components under `tablepro-windows/src/`

## 2. High-level system view

```text
React frontend
  -> Typed IPC wrappers (`src/ipc/commands.ts`)
  -> Command registry (21 commands, `hooks/useCommandRegistry.ts`)
  -> Deep-link handler (`utils/deep-link-handler.ts`)
  -> Tauri invoke boundary
Rust backend (`src-tauri/src/commands/*`)
  -> ConnectionManager (session registry)
  -> HealthMonitor (periodic ping + lost/reconnected signaling)
  -> TabStateStore (backend tab persistence)
  -> DatabaseDriver trait objects
  -> PluginDriverAdapter (FFI bridge)
Plugin DLLs (driver crates) + capability sidecars
  -> Native DB protocols (SQL, BSON, Redis CLI)
External databases (PostgreSQL, MySQL, MSSQL, SQLite, MongoDB, Redis)
```

## 3. Windows runtime architecture

### 3.1 Tauri application composition

`src-tauri/src/lib.rs` wires runtime state with Tauri `manage(...)` and command registration.

Managed state includes:

- `Mutex<ConnectionManager>`
- `Mutex<HealthMonitor>`
- `Mutex<TabStateStore>`
- `Mutex<SettingsStore>`
- `Mutex<ConnectionStore>`
- `Mutex<HistoryStore>`
- `Mutex<FilterStore>`
- `Mutex<AiChatStore>`
- `Mutex<AiCancelState>`

Plugins registered: `tauri-plugin-deep-link`

Command registration includes connection/query/schema/storage/history/import/export/filter/settings/structure/data/AI/tab-state/capability flows.

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
- Reconnect is per-connection with `reconnectingIds: Set<string>` guard (no auto-reconnect loops)
- `reconnect_session(session_id)` recreates connection and emits `connection:reconnected`

### 3.4 Auto-updater

- Tauri updater plugin is registered in non-dev builds (`#[cfg(not(feature = "devtools"))]`)
- Frontend hook `useAutoUpdater.ts` checks update metadata via updater plugin APIs
- Update check is throttled to once every 4 hours using localStorage key `tablepro:last-update-check`

### 3.5 Async I/O patterns

File I/O and SQLite operations are moved off the async runtime via `spawn_blocking` or `block_in_place` wrappers, including in export/import and storage modules.

### 3.6 Payload guardrails

- `MAX_RESULT_ROWS = 50,000` in `commands/query.rs` truncates results exceeding limit
- Truncated results carry `truncated: true` and `totalRowCount` on `QueryResult`
- ABI v1 has no cursor/streaming API; guardrails prevent single-payload OOM

### 3.7 Tab state persistence

- Backend `TabStateStore` (`storage/tab_state_store.rs`) reads/writes `%APPDATA%/TablePro/tab-state.json`
- Commands: `get_tab_state`, `set_tab_state`, `mark_localstorage_migrated`
- Frontend adapter: `stores/tab-state-persistence.ts` wraps IPC calls
- One-time migration from localStorage key `tablepro-editor-tabs` on startup
- Stale tab cleanup on restore

### 3.8 Deep-link routing

- `tauri-plugin-deep-link` registered in `lib.rs`
- Protocol: `tablepro://open/connection/{id}`
- Handler: `utils/deep-link-handler.ts` parses URL and opens saved connection by ID
- Only saved connections are supported (no ad-hoc connection strings)

### 3.9 Command registry and shortcuts

- 21 namespaced `COMMAND_DEFINITIONS` in `hooks/useCommandRegistry.ts`
- `useShortcutStore` persists user binding overrides with Zustand persistence
- Click-to-rebind key capture overlay with conflict detection and swap
- `ShortcutsHelp` derives from registry; settings shortcuts section is read-only display + rebind
- Quick switcher: grouped results (tables, views, collections, databases, schemas, recent queries) with scoring: exact(100) > prefix(80) > substring(60) > fuzzy(30)

### 3.10 EXPLAIN query execution

- `commands/explain.rs`: `explain_query(session_id, sql, db_type)` command
- Universal tree parser: PG JSON, MySQL JSON, MSSQL XML, SQLite tabular → common `ExplainNode` tree
- MSSQL isolation: new short-lived driver connection with SHOWPLAN_XML cleanup
- Single-statement validation prevents injection
- Frontend: `components/editor/explain-panel.tsx` + `explain-node.tsx`

### 3.11 Bulk operations

- `commands/bulk_ops.rs`: `bulk_insert`, `bulk_update`, `bulk_update_preview`
- Bulk insert: 500-row batch INSERT, 50MB file cap, TSV/CSV input
- Bulk update: structured filter builder (10 operators), no freeform WHERE
- Transaction-wrapped with partial failure toast reporting
- Frontend: `components/grid/bulk-insert-dialog.tsx`, `bulk-update-dialog.tsx`

### 3.12 Stored procedure execution

- `commands/routine_ops.rs`: `execute_routine`, `get_routine_source`, `preview_routine_sql`
- System procedure denylist (xp_cmdshell, pg_terminate_backend, etc.)
- String param inputs with backend type casting
- Result shape: `RoutineResult` with `result_set` + `output_params`
- Frontend: `components/procedures/procedure-execute-dialog.tsx`, `sidebar-routine-node.tsx`

### 3.13 Error classification

- `ipc/error.ts`: `classifyError` maps database errors to kind + recovery hint
- Error kinds: auth, network, syntax, constraint, timeout, permission, unknown
- Severity-aware toasts with action buttons (e.g., "Reconnect", "Check syntax")

### 3.14 Internationalization

- i18next + react-i18next framework
- Locale files: `src/i18n/locales/en.json`, `vi.json`
- Language selector in Settings with immediate switching (no restart)
- All UI strings use `t()` translation keys

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
5. Host loads capability sidecar from `driver-capabilities/{dll_name}.capabilities.json`
6. Host keeps DLL loaded while plugin is active

### 4.3 Capability substrate

Each driver DLL has a sidecar `.capabilities.json` in `driver-capabilities/`:

```json
{
  "supportsSqlEditor": true,
  "supportsSchemas": true,
  "supportsCollections": false,
  "supportsDdl": true,
  "supportsInlineEdit": true,
  "supportsImportExport": true,
  "supportsStructureView": true
}
```

- Loaded at DLL load time by `PluginManager`
- Missing sidecar falls back to all-SQL-true defaults
- Frontend queries capabilities via `list_drivers` and `get_driver_capabilities` Tauri commands
- `SchemaStore` gates schema fetches behind capability checks
- Connection form dynamically builds from loaded plugins
- Types: `DriverCapabilities` (`models/capability.rs` + `types/capability.ts`), `DriverInfo`, `DriverCapabilitySidecar`

### 4.4 Driver instantiation and FFI bridge

For each connection, host creates a driver via:

- `PluginManager::create_driver(type_id, config)`
- `PluginDriverAdapter::new(vtable, config, type_id)`

`PluginDriverAdapter`:

- owns plugin `DriverHandle`
- implements `DatabaseDriver`
- converts FFI payloads to Rust models
- uses `catch_unwind` in FFI paths where needed
- destroys handle in `Drop` via plugin vtable destructor

### 4.5 MongoDB driver (`driver-mongodb`)

- cdylib DLL: `type_id = "mongodb"`, default port 27017
- Uses `mongodb` crate (blocking client)
- Connection: `mongodb://` and `mongodb+srv://` with PING verify
- Operations: `find()` with JSON filter/sort/limit, SCAN databases/collections
- Data: BSON-to-row flattening (`bson_flatten.rs`), sample-based column discovery
- No aggregation pipeline (ABI v1 has no cursor API)
- Source modules: `lib.rs`, `driver.rs`, `ops_basic.rs`, `ops_schema.rs`, `ffi_helpers.rs`, `free_fns.rs`, `bson_flatten.rs`

### 4.6 Redis driver (`driver-redis`)

- cdylib DLL: `type_id = "redis"`, default port 6379
- Uses `redis` crate (blocking client) with optional TLS (rustls)
- Connection: `redis://` and `rediss://`, optional password, database 0-15
- CLI command parser: 40+ operations (`command_parser.rs`)
- Key browsing: SCAN-based with Key|Type|TTL|Value columns
- Data types: string, hash, list, set, sorted set, stream
- Write ops: SET, DEL, RENAME, EXPIRE, HSET, LPUSH, SADD, ZADD
- Database switching via SELECT command
- Source modules: `lib.rs`, `driver.rs`, `command_parser.rs`, `ops_basic.rs`, `ops_key.rs`, `ops_hash.rs`, `ops_collection.rs`, `ops_server.rs`, `ops_schema.rs`, `ffi_helpers.rs`, `free_fns.rs`

## 5. Query and table-browse execution path

### 5.1 Query execution (`execute_query`)

`commands/query.rs` flow:

1. Resolve driver clone from `ConnectionManager` by `session_id`
2. Emit `query:started`
3. Start periodic `query:progress` event timer
4. Execute SQL asynchronously through driver
5. Apply payload guardrails: truncate at `MAX_RESULT_ROWS` if exceeded, set `truncated`/`totalRowCount`
6. Emit `query:completed` or `query:error`
7. Return `QueryResult` or `AppError`

### 5.2 Paginated browse (`fetch_rows`, `fetch_count`)

- Qualified table name built from `table` + optional `schema`
- Optional `where_clause` is validated with basic safety guards
- `LIMIT/OFFSET` pagination is applied in generated SQL

### 5.3 Query cancellation

`cancel_query(session_id)` routes to driver `cancel_query()`.

## 6. Frontend architecture highlights

### 6.1 State model (Zustand stores)

Key stores:

- `connectionStore`: saved connection map, status map, `sessionIds`, per-connection `reconnectingIds` guard
- `queryStore`: run/cancel flow, result/error state
- `schemaStore`: tables/columns/indexes/foreign keys/routines metadata state, capability-gated fetches
- `changeStore`: staged edits before `save_changes`
- `editorStore`: tab state (backed by `TabStateStore` JSON), preview tab support
- `filterStore`: filter conditions and presets
- `history.ts`: recent/search/delete/clear history state
- `settingsStore`: app settings state
- `aiStore`: AI provider/model/settings/conversation UI state
- `useShortcutStore`: user keyboard binding overrides with conflict detection
- `tab-state-persistence.ts`: IPC adapter for backend tab state JSON

### 6.2 Main UI composition

`MainLayout.tsx` integrates sidebar, query editor, results grid, filter panel, inspector, history panel, settings/quick-switcher flows, and driver-specific panels (MongoDB query panel, Redis command panel, Redis database selector).

## 7. Persistence architecture

### 7.1 Backend files

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- Tab state: `config_dir/TablePro/tab-state.json`
- History: `data_dir/TablePro/history.sqlite3`
- AI chat: `data_dir/TablePro/ai_chat.sqlite3`

### 7.2 History database

`HistoryStore` initializes:

- `history` table
- `history_fts` FTS5 virtual table (`content=history`)
- triggers to keep FTS index in sync

### 7.3 Frontend persistence

- Tab state persists via backend JSON (`tab-state.json`); one-time migration from localStorage `tablepro-editor-tabs`
- Shortcut overrides persist via `useShortcutStore` (Zustand persistence)
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

1. `src-tauri/src/lib.rs` (managed state, command registration, plugin registration)
2. `src-tauri/src/plugin/manager.rs` (ABI, discovery, capability sidecar loading)
3. `src-tauri/src/commands/query.rs` and `commands/connection.rs` (runtime flow, payload guardrails)
4. `src-tauri/src/storage/*.rs` and frontend stores (persistence/security claims)
5. `src-tauri/driver-capabilities/*.capabilities.json` (capability flag count and defaults)
6. `src-tauri/driver-mongodb/` and `driver-redis/` (driver-specific behavior claims)

---

**Last Updated**: 2026-04-08  
**Architecture focus**: Active Windows runtime + plugin/session/AI/health/capability/deep-link flows
