# TablePro Product Development Requirements (PDR)

## Purpose

This document defines current product requirements for TablePro based on verified implementation state as of 2026-08-18.

## Product scope

TablePro is a Windows-only, personal, non-profit database client. The fork has permanently detached from its upstream macOS origin — no macOS code remains in this repository.

- Only product: this repository (Tauri v2 + Rust + React)

Windows implementation status in source:

- Tauri runtime and IPC command surface are implemented; drivers are statically-linked (`rlib`) Rust crates compiled into the single binary — there is no DLL/plugin loader
- Session-based command routing (`session_id`) is implemented
- Query execution has two paths with different row caps: legacy `execute_query` (fixed `MAX_RESULT_ROWS = 50,000`) and `execute_query_streaming` (the path the editor uses, capped by the user's `store_max_rows` setting)
- Query cancellation is real per-engine (PostgreSQL cancel token, MySQL `KILL QUERY`, SQLite local); MSSQL/MongoDB/Redis report `Unsupported` and the UI hides Cancel for them
- SQL import/export and staged edit save flow are implemented
- Per-connection user-initiated reconnect is implemented; connection loss is detected reactively from query-error messages, not by a periodic health-monitor ping
- AI chat and inline AI suggestions are implemented
- Driver capability substrate with sidecar metadata files (embedded into the binary at build time) is implemented
- 6 database drivers: PostgreSQL, MySQL, SQL Server, SQLite, MongoDB, Redis
- Tab state persistence via backend JSON file with localStorage migration is implemented
- Command registry (28 commands), customizable shortcuts, and deep-link protocol are implemented
- Error classifier with kind-based recovery hints and severity-aware toasts are implemented
- EXPLAIN query viewer (PG/MySQL/MSSQL/SQLite) with universal tree parser is implemented
- Bulk insert (TSV/CSV), bulk update (structured filter builder), and bulk delete are implemented
- Stored procedure execute/view source with system procedure denylist is implemented
- First-launch onboarding is implemented
- i18n framework (i18next, English + Vietnamese) with immediate language switching is implemented
- Connection export/import (with optional credential inclusion) is implemented
- Crash-dump collection (panic hook writing to a local file, viewable/deletable from Settings) is implemented
- Local metrics (JSONL) and rotating backend logs are implemented — no telemetry, nothing leaves the machine (`docs/development/local-metrics.md`)
- Opt-in dual credential storage: DPAPI always, plus Windows Credential Manager when the user enables it in settings
- There is no auto-updater in this codebase

## Functional requirements

### 1) Connection management

The system must:

- Save/list/delete connections via `list_connections`, `save_connection`, `delete_connection`
- Open runtime sessions via `connect(config) -> session_id`
- Route operational commands via `session_id`
- Support `disconnect`, `get_connection_status`, and `reconnect_session`
- Support optional SSH tunnel setup in backend connection flow
- Support group management via `list_groups`, `save_group`, `delete_group`
- Support connection export/import via `export_connections`, `import_connections_preview`, `confirm_import`, `build_import_link`

### 2) Query execution

The system must:

- Execute SQL through `execute_query(session_id, sql, params?)` (legacy) or `execute_query_streaming` (editor path, chunked over a Tauri channel)
- Support paginated table browse via `fetch_rows` and `fetch_count`
- Support cancellation via `cancel_query(session_id)`, with per-engine support (PostgreSQL/MySQL/SQLite: real cancel; MSSQL/MongoDB/Redis: unsupported, gated off in UI)
- Record and retrieve history via `history_record`, `history_fetch_recent`, `history_search`

### 3) Schema exploration

The system must provide:

- Table listing (`fetch_tables`)
- Columns (`fetch_columns`)
- Indexes (`fetch_indexes`)
- Foreign keys (`fetch_foreign_keys`)
- Databases and switching (`fetch_databases`, `switch_database`)
- Schemas and DDL (`fetch_schemas`, `fetch_ddl`)
- Routine discovery (`fetch_routines`)
- Enum values and approximate counts (`fetch_enum_values`, `fetch_approximate_count`)

### 4) Data editing and transfer

The system must:

- Support staged grid edits and commit through `save_changes`, quoting generated SQL by the column's declared type (not by guessing from the value's shape)
- Support row SQL generation via `generate_row_sql`
- Support file export via `export_to_file`, paginating only when the query already has a top-level `ORDER BY`
- Support SQL import preview/import via `import_preview`, `import_sql_file`

### 5) AI workflows

The system must provide:

- Streaming AI chat and cancellation (`ai_chat_stream`, `ai_cancel_chat`)
- Inline SQL suggestion generation (`ai_inline_suggest`)
- Schema context assembly (`ai_build_context`)
- Conversation CRUD and persistence (`ai_create_conversation`, `ai_save_message`, `ai_list_conversations`, `ai_get_conversation`, `ai_delete_conversation`, `ai_clear_all_conversations`)
- Provider/model probing (`ai_list_models`, `ai_test_provider`)

### 6) Driver capability substrate

The system must:

- Embed `.capabilities.json` sidecar content for each driver into the binary at build time (`include_str!` in `drivers/registry.rs`) — not read from disk at runtime
- Expose 8 boolean capability flags: `supportsSqlEditor`, `supportsSchemas`, `supportsCollections`, `supportsDdl`, `supportsInlineEdit`, `supportsImportExport`, `supportsStructureView`, `supportsQueryCancellation`
- Fall back to per-flag defaults when a sidecar fails to parse (SQL-shape flags `true`, `supportsCollections`/`supportsQueryCancellation` `false`)
- Expose capabilities to frontend via `list_drivers` and `get_driver_capabilities` commands
- Gate UI features (SQL editor, structure view, DDL, import/export, cancel) behind capability checks

### 7) MongoDB workflows

The system must:

- Connect via `mongodb://` or `mongodb+srv://` with optional authentication
- Execute `find()` queries with JSON filter, sort, and limit (no aggregation pipeline)
- Flatten BSON documents to tabular rows with sample-based column discovery
- Scan databases and collections for sidebar browsing
- Hide SQL editor, structure view, DDL, import/export, and query cancellation via capability gating

### 8) Redis workflows

The system must:

- Connect via `redis://` or `rediss://` with optional password and TLS (rustls)
- Parse and execute CLI commands
- Browse keys via SCAN with Key|Type|TTL|Value columns
- Handle all Redis data types: string, hash, list, set, sorted set, stream
- Support write operations: SET, DEL, RENAME, EXPIRE, HSET, LPUSH, SADD, ZADD
- Support database switching (`SELECT 0-15` typed as a command — there is no dedicated selector control; `redis-database-selector.tsx` was deleted as dead code in `3ca59979`)
- Hide SQL editor, schema, structure, DDL, import/export, and query cancellation via capability gating

### 9) Tab state persistence

The system must:

- Persist editor tab state to backend JSON file (`%APPDATA%/TablePro/tab-state.json`) via `TabStateStore`
- Perform one-time migration from localStorage on startup
- Clean up stale tabs on restore
- Expose `get_tab_state`, `set_tab_state`, `mark_localstorage_migrated` commands

### 10) Command model and deep-links

The system must:

- Maintain centralized command registry (28 namespaced `COMMAND_DEFINITIONS` in `useCommandRegistry.ts`)
- Support customizable keyboard shortcuts with conflict detection and swap (`useShortcutStore`), dispatched globally through `useMainLayoutShortcuts.ts`
- Handle deep-link protocol `tablepro://open/connection/{id}` via `tauri-plugin-deep-link`

### 11) Error handling and classification

The system must:

- Classify database errors by kind (auth, network, syntax, constraint, timeout, permission)
- Map error kinds to recovery hints with action buttons
- Display severity-aware toasts (info, warning, error) via `classifyError` in `ipc/error.ts`

### 12) EXPLAIN query

The system must:

- Execute EXPLAIN (not ANALYZE) for PG, MySQL, MSSQL, SQLite via `explain_query`
- Parse engine-specific output into universal `ExplainNode` tree
- Validate single-statement input to prevent injection
- Isolate MSSQL EXPLAIN in a dedicated short-lived connection

### 13) Bulk data operations

The system must:

- Support bulk insert via `bulk_insert` (TSV paste + CSV file)
- Support bulk update via `bulk_update` with structured filter builder (no freeform WHERE)
- Support bulk delete via `bulk_delete`
- Preview affected rows via `bulk_update_preview` / `bulk_delete_preview`
- Wrap operations in transactions with partial failure reporting

### 14) Stored procedure execution

The system must:

- Execute routines via `execute_routine` with string param inputs and backend type casting
- Preview generated SQL via `preview_routine_sql`
- Retrieve source code via `get_routine_source`
- Block system procedures via denylist (xp_cmdshell, pg_terminate_backend, etc.)

### 15) Onboarding

The system must:

- Show a first-launch onboarding flow
- Support draft mode connection form (no zombie connections on cancel)

### 16) Internationalization

The system must:

- Use i18next + react-i18next for UI string translation
- Ship English and Vietnamese locale files
- Provide language selector in Settings with immediate switching (no restart)

### 17) Crash and diagnostics

The system must:

- Install a panic hook that writes crash records to `%LOCALAPPDATA%\TablePro\crashes\` (`services/crash_handler.rs`)
- Expose `list_crash_dumps`/`delete_crash_dump` for a Settings-level crash dump UI
- Write rotating backend logs (`%LOCALAPPDATA%\TablePro\logs\`) and local JSONL metrics — no network calls, nothing uploaded (see `docs/development/local-metrics.md`)

## Non-functional requirements

### Performance

- UI must stay responsive during pagination and large result display
- Backend command handlers must keep lock scopes short
- File and SQLite operations must run in blocking wrappers (`spawn_blocking` / `block_in_place`)
- The editor's query path (`execute_query_streaming`) caps rows before the columnar copy at the user's `store_max_rows` setting, not a fixed constant

### Reliability

- Rust commands return `Result<_, AppError>` and avoid panics in normal flow
- A process-wide rustls crypto provider is installed once (`driver-common/src/tls.rs`) so TLS-backed drivers don't panic on their first connection
- Connection loss is detected reactively from query-error text; reconnect is per-connection with `reconnectingIds: Set<string>` guard (no auto-reconnect loops)
- Tab state persists to backend file for crash resilience
- A panic hook captures crash dumps for post-mortem diagnosis

### Security

Current storage behavior in source:

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- History: `data_dir/TablePro/history.sqlite3`
- Tab state: `config_dir/TablePro/tab-state.json` (backend `TabStateStore`, migrated from localStorage)

Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are encrypted at rest using Windows DPAPI (`services/credential_store.rs`) and stored as `dpapi:`-prefixed values. Legacy plaintext is auto-migrated. When the user opts in (`remember_credentials_in_os_keychain`), a second copy is written to Windows Credential Manager (`services/credential_manager.rs`).

### Observability

- Runtime logs use `tracing`, written to a rotating daily file (release builds have no console)
- Renderer error logging command (`log_renderer_error`) is exposed
- Query execution emits progress/completion/error events
- Local metrics recorded as JSONL, no telemetry (`docs/development/local-metrics.md`)

## Driver architecture note

Drivers are compiled-in Rust crates, statically linked (`rlib`) into the `tablepro-windows` binary — not DLLs, not loaded via FFI at runtime. Capability sidecar JSON is embedded at build time via `include_str!`, not read from `driver-capabilities/` at runtime. `src-tauri/Cargo.toml` lists the driver crates as workspace path members; there is no `plugin-sdk` crate.

## Acceptance criteria snapshot

| Area | Status | Evidence |
|---|---|---|
| Session-based command flow | Implemented | `commands/query.rs`, `services/connection_manager.rs` |
| Static driver registry | Implemented | `drivers/registry.rs`, `driver-common/src/lib.rs` |
| Capability substrate (embedded sidecar) | Implemented | `driver-capabilities/*.capabilities.json`, `models/capability.rs` |
| History SQLite + FTS | Implemented | `storage/history_store.rs` |
| Tab state persistence (backend) | Implemented | `storage/tab_state_store.rs`, `commands/tab_state.rs`, `stores/tab-state-persistence.ts` |
| DPAPI secret encryption | Implemented | `services/credential_store.rs`, `storage/connection_store.rs` |
| Windows Credential Manager (opt-in) | Implemented | `services/credential_manager.rs`, `commands/credential.rs` |
| AI chat + inline suggestions | Implemented | `commands/ai.rs`, frontend AI components/stores |
| Reactive connection-loss detection + per-connection reconnect | Implemented | `commands/query.rs`, `commands/connection.rs`, `stores/connectionStore.ts` |
| Streaming query row cap (`store_max_rows`) | Implemented | `commands/query_streaming.rs` |
| Legacy query row cap (`MAX_RESULT_ROWS`) | Implemented (legacy path only) | `commands/query.rs` |
| Per-engine query cancellation | Implemented | `commands/query.rs`, `driver-mysql/src/cancel.rs`, `driver-postgres/src/lib.rs` |
| MongoDB driver | Implemented | `driver-mongodb/`, `components/mongodb/mongodb-query-panel.tsx` |
| Redis driver | Implemented | `driver-redis/`, `components/redis/redis-command-panel.tsx` |
| Command registry + shortcuts | Implemented | `hooks/useCommandRegistry.ts`, `hooks/useMainLayoutShortcuts.ts` |
| Deep-link protocol | Implemented | `utils/deep-link-handler.ts`, `tauri-plugin-deep-link` in `lib.rs` |
| Error classifier + recovery hints | Implemented | `ipc/error.ts` |
| EXPLAIN query viewer | Implemented | `commands/explain.rs`, `components/editor/explain-panel.tsx` |
| Bulk insert/update/delete | Implemented | `commands/bulk_ops.rs`, `components/grid/bulk-*-dialog.tsx` |
| Stored procedure execution | Implemented | `commands/routine_ops.rs`, `components/procedures/` |
| First-launch onboarding | Implemented | `components/onboarding/` |
| i18n (EN + VI) | Implemented | `i18n/index.ts`, `i18n/locales/en.json`, `i18n/locales/vi.json` |
| Connection export/import | Implemented | `commands/connection_export.rs`, `services/connection_export.rs` |
| Crash dump collection | Implemented | `services/crash_handler.rs`, `commands/crash.rs` |
| Local metrics + rotating logs | Implemented | `services/app_logging.rs`, `src/metrics/local-metrics.ts`, `docs/development/local-metrics.md` |
| Auto-updater | Not present | no `tauri-plugin-updater` in `Cargo.toml`, no update-check code |

## Constraints and decisions

- Documentation describes repository reality, not intended future state
- Platform claims must state that Windows is the only supported platform — no macOS code or reference target remains
- Security claims must stay aligned with storage code

## Requirement change log

- **2026-08-18**: Reconciled against 28 commits since the flattening: removed the fabricated DLL/plugin ABI and health-monitor sections; corrected query cap, cancellation, and command registry counts; added connection export/import, crash dumps, Windows Credential Manager, local metrics, TLS crypto provider, and bulk delete; removed the auto-updater (does not exist in source).
- **2026-04-08**: Added error classifier, EXPLAIN viewer, bulk operations, stored procedure execution, onboarding, i18n. Updated acceptance criteria.
- **2026-04-04**: Added MongoDB, Redis, capability substrate, tab persistence backend, command registry, deep-links, payload guardrails, customizable shortcuts. Updated acceptance criteria.
- **2026-04-02**: Refreshed requirements for current command surface including AI and health/reconnect flows.
- **2026-03-18**: Session-based model, plugin ABI, DPAPI encryption, async I/O migration.

---

**Last Updated**: 2026-08-18
**Document Status**: Active
**Source Scope**: repository-root runtime + docs alignment
