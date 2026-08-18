# TablePro System Architecture

## 1. Scope and source of truth

This document describes architecture reflected in current repository code as of 2026-08-18, focused on the active Windows implementation at the repository root.

Primary verified sources:

- `src-tauri/src/lib.rs`
- `src-tauri/src/drivers/registry.rs`
- `src-tauri/src/drivers/adapter.rs`
- `src-tauri/src/services/connection_manager.rs`
- `src-tauri/src/commands/query.rs`
- `src-tauri/src/commands/query_streaming.rs`
- `src-tauri/src/commands/connection.rs`
- `src-tauri/src/commands/tab_state.rs`
- `src-tauri/src/storage/tab_state_store.rs`
- `src-tauri/src/models/capability.rs`
- `src-tauri/driver-common/src/tls.rs`
- `src-tauri/driver-mysql/src/cancel.rs`
- `src-tauri/driver-mongodb/`
- `src-tauri/driver-redis/`
- `src-tauri/driver-capabilities/`
- `src-tauri/src/commands/explain.rs`
- `src-tauri/src/commands/bulk_ops.rs`
- `src-tauri/src/commands/routine_ops.rs`
- Frontend stores/components under `src/`

There is no `src-tauri/src/plugin/` directory and no `plugin-sdk` crate in this repository — earlier revisions of this document described a DLL/FFI plugin loader that does not exist in the current source. See §4.

## 2. High-level system view

```text
React frontend
  -> Typed IPC wrappers (`src/ipc/commands.ts`)
  -> Command registry (28 commands, `hooks/useCommandRegistry.ts`)
  -> Deep-link handler (`utils/deep-link-handler.ts`)
  -> Tauri invoke boundary
Rust backend (`src-tauri/src/commands/*`)
  -> ConnectionManager (session registry)
  -> TabStateStore (backend tab persistence)
  -> DatabaseDriver trait objects
  -> HostDriverAdapter (type/error conversion, not an FFI bridge)
Driver crates (statically linked rlibs) + embedded capability sidecars
  -> Native DB protocols (SQL, BSON, Redis CLI)
External databases (PostgreSQL, MySQL, MSSQL, SQLite, MongoDB, Redis)
```

## 3. Windows runtime architecture

### 3.1 Tauri application composition

`src-tauri/src/lib.rs` wires runtime state with Tauri `manage(...)` and command registration.

Managed state includes:

- `Mutex<ConnectionManager>`
- `Mutex<commands::ai::AiCancelState>`
- `Mutex<SettingsStore>`
- `Mutex<TabStateStore>`
- `Mutex<ConnectionStore>`
- `Mutex<HistoryStore>`
- `Mutex<FilterStore>`
- `Mutex<AiChatStore>`

There is no `Mutex<HealthMonitor>` — no health-monitor module exists in this codebase.

Plugins registered: `tauri-plugin-dialog`, `tauri-plugin-shell`, `tauri-plugin-single-instance`, `tauri-plugin-deep-link`. There is no `tauri-plugin-updater` — this app has no auto-updater (see §3.4).

Command registration includes connection/query/query-streaming/schema/storage/history/import/export/filter/settings/structure/data/AI/tab-state/capability/crash-dump/credential/connection-export flows.

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

### 3.3 Connection loss detection and reconnect flow

There is no periodic health-monitor ping in this codebase. Instead:

- `commands/query.rs` inspects a query error's message on failure; if it contains `connection`, `broken pipe`, `connection reset`, or `not connected`, it emits `connection:lost` as a reactive "safety net" — connection loss is detected only when a query actually fails, not proactively
- Frontend listens for `connection:lost` (`stores/connectionStore.ts`) and offers reconnect
- Reconnect is per-connection with `reconnectingIds: Set<string>` guard (no auto-reconnect loops)
- `reconnect_session(session_id)` recreates connection and emits `connection:reconnected`

### 3.4 Auto-updater

There is no auto-updater. `Cargo.toml` has no `tauri-plugin-updater` dependency, and `src/hooks/useAutoUpdater.ts` is deleted. Any prior documentation describing update-check throttling or a `tablepro:last-update-check` localStorage key described a feature that has since been removed entirely, not a stale detail to correct.

### 3.5 Async I/O patterns

File I/O and SQLite operations are moved off the async runtime via `spawn_blocking` or `block_in_place` wrappers, including in export/import and storage modules.

### 3.6 Payload guardrails and query result caps

There are two independent, non-overlapping cap mechanisms — they apply to different commands:

- **`execute_query`** (`commands/query.rs`, legacy non-streaming path): truncates at `MAX_RESULT_ROWS = 50,000`, sets `truncated: true` and `totalRowCount` on `QueryResult`. The query editor does not call this command.
- **`execute_query_streaming`** (`commands/query_streaming.rs`, the path the query editor actually uses): caps rows via `effective_row_cap()`, which reads the user's `store_max_rows` setting (default 100,000; range clamped to `[10_000, 10_000_000]` by `set_settings`) — not the fixed 50,000 constant. The cap is applied before the columnar copy, so oversized results never reach the three-times-materialized row/columnar/chunk stage that used to risk an OOM abort (`panic = "abort"` in release builds). `truncated`/`total_rows` are reported honestly on the response.

A streaming run also now waits for its terminal chunk before the frontend considers it finished — large row chunks arrive on a second IPC round-trip after the command replies, and until `c441adb1` this could leave the grid showing headers with no rows.

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

- 28 namespaced `COMMAND_DEFINITIONS` in `hooks/useCommandRegistry.ts` (`grep -c "id:" src/hooks/useCommandRegistry.ts`)
- Global shortcut dispatch is a single dispatcher, `hooks/useMainLayoutShortcuts.ts`, which reads bindings from the command registry (including user overrides) and looks up the handler in `CommandStore`. `src/hooks/useKeyboardShortcuts.ts` — a duplicate dispatcher nothing imported — is deleted; every global shortcut now routes through this one registry-backed path.
- A fixed set of commands (`editor.run`, `editor.explain`, `editor.formatSql`, `editor.toggleComment`, `app.refreshSchema`) is deliberately left to the CodeMirror keymap (`src/editor/keybindings.ts`) instead of the global dispatcher, because CodeMirror does not stop propagation and dispatching them twice would double-run them
- `useShortcutStore` (also in `useCommandRegistry.ts`) persists user binding overrides with Zustand persistence
- `ShortcutsHelp` derives from registry; settings shortcuts section is read-only display + rebind

### 3.10 EXPLAIN query execution

- `commands/explain.rs`: `explain_query(session_id, sql, db_type)` command
- Universal tree parser: PG JSON, MySQL JSON, MSSQL XML, SQLite tabular → common `ExplainNode` tree
- MSSQL isolation: new short-lived driver connection with SHOWPLAN_XML cleanup
- Single-statement validation prevents injection
- Frontend: `components/editor/explain-panel.tsx` + `explain-node.tsx`

### 3.11 Bulk operations

- `commands/bulk_ops.rs`: `bulk_insert`, `bulk_update`, `bulk_update_preview`, `bulk_delete`, `bulk_delete_preview`
- Bulk insert: TSV/CSV input
- Bulk update: structured filter builder, no freeform WHERE
- Transaction-wrapped with partial failure toast reporting
- Frontend: `components/grid/bulk-insert-dialog.tsx`, `bulk-update-dialog.tsx`

### 3.12 Stored procedure execution

- `commands/routine_ops.rs`: `execute_routine`, `get_routine_source`, `preview_routine_sql`
- System procedure denylist (xp_cmdshell, pg_terminate_backend, etc.)
- String param inputs with backend type casting
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

### 3.15 Logging and local metrics

- Backend logs go to a rotating daily file under `%LOCALAPPDATA%\TablePro\logs\` (`services/app_logging.rs`), because release builds set `windows_subsystem = "windows"` and have no console for a stderr subscriber
- Query and session measurements are recorded as local JSONL — schema and rotation behavior documented in `docs/development/local-metrics.md` (not duplicated here)
- Settings → Diagnostics exposes an **Open Log Folder** command (`open_logs_folder`)

### 3.16 TLS crypto provider

- `driver-common/src/tls.rs::ensure_crypto_provider()` installs `aws-lc-rs` as the process-wide rustls crypto provider exactly once (`std::sync::Once`)
- Necessary because more than one rustls crypto backend ends up compiled into the workspace (`mysql_async`/`redis`/`mongodb` pull `aws-lc-rs`, `reqwest`'s `rustls-tls` pulls `ring` via `hyper-rustls`) and rustls 0.23 refuses to auto-select one — without this call the first TLS connection panics, which is fatal in a release build (`panic = "abort"`)
- Every driver that opens a rustls connection calls this before connecting

### 3.17 Query cancellation

`cancel_query(session_id)` routes to the driver's `cancel_query()`. Support is per-engine, not uniform:

- PostgreSQL: `client.cancel_token()` captured at connect time, cancelled via a fresh connection
- MySQL: `KILL QUERY <connection_id>` issued on a **second** connection (`driver-mysql/src/cancel.rs`)
- SQLite: cancels locally (no server round-trip)
- MSSQL, MongoDB, Redis: `cancel_query()` returns `Unsupported`; the frontend hides the Cancel affordance for these via each driver's `supportsQueryCancellation` capability flag (`false` for these three, `true` for Postgres/MySQL/SQLite)

Per-tab cancellation ownership is tracked in `src/stores/tab-stream-registry.ts`: the owning tab key and session id are captured when a streaming run starts, so a tab switch mid-run cannot redirect the cancel to a different tab or session.

## 4. Driver architecture (statically linked, not a plugin/DLL system)

### 4.1 What the source actually does

`src-tauri/src/drivers/registry.rs` and `driver-common/src/lib.rs` both state in their module docs that all six database drivers compile in as `rlib` crates and are statically linked into the single `tablepro-windows` binary — there is **no** DLL loading, **no** FFI vtable handshake, and **no** `plugin-sdk` crate in this repository. `src-tauri/Cargo.toml`'s workspace lists the driver crates as regular path members; `[lib] crate-type = ["rlib"]` on the host crate confirms this is not building `cdylib` plugins.

`DriverRegistry::new()` builds one `EngineMeta` per `DriverKind` (Postgres, MySql, Mssql, Sqlite, MongoDb, Redis) at process startup, using capability JSON embedded via `include_str!` at compile time — not read from disk. `DriverRegistry::create_driver(type_id, config)` matches on `DriverKind` and directly constructs the corresponding driver crate's struct (e.g. `driver_postgres::PostgresDriver::new(...)`), wrapping it in `HostDriverAdapter`.

`HostDriverAdapter` (`drivers/adapter.rs`) is a type/error-conversion shim between `driver_common::DatabaseDriver` and the host's own `DatabaseDriver` trait — it is not an FFI bridge and does not cross a DLL boundary.

Code identifiers still use the historical "plugin" vocabulary in a few places (`PluginMetadataInfo`, `list_plugins()`, `AppError::PluginError`), a naming holdover from before the driver system was made static. Documentation should not read these names as evidence of a live plugin loader.

### 4.2 Capability substrate

Each driver has a sidecar `.capabilities.json` in `driver-capabilities/`, embedded into the binary at build time:

```json
{
  "engine": "postgres",
  "displayName": "PostgreSQL",
  "capabilities": {
    "supportsSqlEditor": true,
    "supportsSchemas": true,
    "supportsCollections": false,
    "supportsDdl": true,
    "supportsInlineEdit": true,
    "supportsImportExport": true,
    "supportsStructureView": true,
    "supportsQueryCancellation": true
  }
}
```

- Parsed once at `DriverRegistry::new()`; a parse failure falls back to per-flag defaults (all SQL-shape flags `true`, `supportsCollections`/`supportsQueryCancellation` `false`) rather than failing startup
- Frontend queries capabilities via `list_drivers` and `get_driver_capabilities` Tauri commands
- `SchemaStore` gates schema fetches behind capability checks
- Types: `DriverCapabilities` (`models/capability.rs` + `types/capability.ts`)

### 4.3 MongoDB driver (`driver-mongodb`)

- `type_id = "mongodb"`, default port 27017, statically linked (not a DLL)
- Uses `mongodb` crate (blocking client)
- Connection: `mongodb://` and `mongodb+srv://` with PING verify
- Operations: `find()` with JSON filter/sort/limit, SCAN databases/collections
- Data: BSON-to-row flattening, sample-based column discovery
- 4 source files under `driver-mongodb/src/`

### 4.4 Redis driver (`driver-redis`)

- `type_id = "redis"`, default port 6379, statically linked (not a DLL)
- Uses `redis` crate (blocking client) with optional TLS (rustls)
- Connection: `redis://` and `rediss://`, optional password, database 0-15
- CLI command parser
- Key browsing: SCAN-based with Key|Type|TTL|Value columns
- Data types: string, hash, list, set, sorted set, stream
- Write ops: SET, DEL, RENAME, EXPIRE, HSET, LPUSH, SADD, ZADD
- Database switching via SELECT command
- 9 source files under `driver-redis/src/`

## 5. Query and table-browse execution path

### 5.1 Query execution — two paths

`commands/query.rs` (`execute_query`, legacy):

1. Resolve driver clone from `ConnectionManager` by `session_id`
2. Emit `query:started`
3. Start periodic `query:progress` event timer
4. Execute SQL asynchronously through driver
5. Truncate at `MAX_RESULT_ROWS = 50,000` if exceeded, set `truncated`/`totalRowCount`
6. Emit `query:completed` or `query:error` (the latter also emits `connection:lost` if the error looks connection-related — see §3.3)
7. Return `QueryResult` or `AppError`

`commands/query_streaming.rs` (`execute_query_streaming`, what the editor actually calls):

1. Executes the query and applies `effective_row_cap()` (sourced from `store_max_rows`, see §3.6) before the columnar copy
2. Streams chunks over a Tauri `Channel<QueryChunk>`
3. The frontend waits for the terminal chunk before considering the run finished

### 5.2 Paginated browse (`fetch_rows`, `fetch_count`)

- Qualified table name built from `table` + optional `schema`
- Optional `where_clause` is validated with basic safety guards
- `LIMIT/OFFSET` pagination is applied in generated SQL

### 5.3 Query cancellation

See §3.17 for the full per-engine breakdown.

## 6. Frontend architecture highlights

### 6.1 State model (Zustand stores)

Key stores (`src/stores/`):

- `connectionStore`: saved connection map, status map, `sessionIds`, per-connection `reconnectingIds` guard
- `queryStore`: run/cancel flow, result/error state
- `schemaStore`: tables/columns/indexes/foreign keys/routines metadata state, capability-gated fetches
- `changeStore`: staged edits before `save_changes`
- `editorStore`: tab state (backed by `TabStateStore` JSON), preview tab support
- `editorStatusStore`: cursor/statement position, fed by a CodeMirror `updateListener` (not a poll)
- `tab-stream-registry`: per-tab streaming-query ownership and cancel wiring
- `filterStore`: filter conditions and presets
- `history.ts`: recent/search/delete/clear history state
- `settingsStore`: app settings state
- `aiChatStore`: AI provider/model/settings/conversation UI state
- `useShortcutStore`: user keyboard binding overrides with conflict detection (in `useCommandRegistry.ts`)
- `tab-state-persistence.ts`: IPC adapter for backend tab state JSON

### 6.2 Main UI composition

The layout integrates sidebar, query editor, results grid, filter panel, inspector, history panel, settings, and driver-specific panels (MongoDB query panel, Redis command panel, Redis database selector).

## 7. Persistence architecture

### 7.1 Backend files

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- Tab state: `config_dir/TablePro/tab-state.json`
- History: `data_dir/TablePro/history.sqlite3`
- AI chat: `data_dir/TablePro/ai_chat.sqlite3`
- Logs: `%LOCALAPPDATA%\TablePro\logs\` (`tracing` output + `metrics.jsonl`)
- Crash dumps: `%LOCALAPPDATA%\TablePro\crashes\`

### 7.2 History database

`HistoryStore` initializes:

- `history` table
- `history_fts` FTS5 virtual table (`content=history`)
- triggers to keep FTS index in sync

### 7.3 Frontend persistence

- Tab state persists via backend JSON (`tab-state.json`); one-time migration from localStorage `tablepro-editor-tabs`
- Shortcut overrides persist via `useShortcutStore` (Zustand persistence)

### 7.4 Credential security

Connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are encrypted at rest using Windows DPAPI (`services/credential_store.rs`) and stored with `dpapi:` prefix in `connections.json`. Legacy plaintext values are auto-migrated on save. When the user enables `remember_credentials_in_os_keychain` in settings, passwords are additionally written to Windows Credential Manager via `services/credential_manager.rs` (`cred_save`/`cred_load`/`cred_delete` commands) — this is a second, opt-in store, not a replacement for DPAPI.

## 8. Error handling and observability

- Backend commands return `Result<_, AppError>`
- Runtime logs use `tracing`, written to a rotating file (§3.15) because release builds have no console
- A panic hook (`services/crash_handler.rs`) writes crash dumps to `%LOCALAPPDATA%\TablePro\crashes\`; exposed via `list_crash_dumps`/`delete_crash_dump`
- Renderer error reporting command exists: `log_renderer_error`

## 9. Lifecycle and ownership constraints

- `ConnectionManager` retains active drivers keyed by session
- `SshTunnelManager` (inside `ConnectionManager`) tracks SSH tunnels in parallel, keyed by session ID

## 10. Architectural stale-risk checkpoints

Re-verify these files when updating architecture docs:

1. `src-tauri/src/lib.rs` (managed state, command registration, plugin registration)
2. `src-tauri/src/drivers/registry.rs` (static driver construction, embedded capability sidecars)
3. `src-tauri/src/commands/query.rs` and `commands/query_streaming.rs` (the two, different, row-cap mechanisms)
4. `src-tauri/src/storage/*.rs` and frontend stores (persistence/security claims)
5. `src-tauri/driver-capabilities/*.capabilities.json` (capability flag count and defaults — currently 8 flags)
6. `src-tauri/driver-mongodb/` and `driver-redis/` (driver-specific behavior claims)

---

**Last Updated**: 2026-08-18
**Architecture focus**: Active Windows runtime + static driver/session/AI/capability/deep-link flows
