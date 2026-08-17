# TablePro Product Development Requirements (PDR)

## Purpose

This document defines current product requirements for TablePro based on verified implementation state as of 2026-08-17.

## Product scope

TablePro is a Windows-only, personal, non-profit database client. The fork has permanently detached from its upstream macOS origin — no macOS code remains in this repository.

- Only product: this repository (Tauri v2 + Rust + React)

Windows implementation status in source:

- Tauri runtime and IPC command surface are implemented; drivers are compiled-in Rust crates (no plugin/DLL loader)
- Session-based command routing (`session_id`) is implemented
- Query/schema/data workflows are implemented with payload guardrails (`MAX_RESULT_ROWS = 50,000`)
- SQL import/export and staged edit save flow are implemented
- Per-connection user-initiated reconnect, AI chat, and inline AI suggestions are implemented
- Driver capability substrate with sidecar metadata files is implemented
- 6 database drivers: PostgreSQL, MySQL, SQL Server, SQLite, MongoDB, Redis
- Tab state persistence via backend JSON file with localStorage migration is implemented
- Command registry (21 commands), customizable shortcuts, and deep-link protocol are implemented
- Error classifier with kind-based recovery hints and severity-aware toasts are implemented
- EXPLAIN query viewer (PG/MySQL/MSSQL/SQLite) with universal tree parser is implemented
- Bulk insert (TSV/CSV, 500-row batches) and bulk update (structured filter builder) are implemented
- Stored procedure execute/view source with system procedure denylist is implemented
- First-launch onboarding (3-step wizard) is implemented
- i18n framework (i18next, English + Vietnamese) with immediate language switching is implemented

## Functional requirements

### 1) Connection management

The system must:

- Save/list/delete connections via `list_connections`, `save_connection`, `delete_connection`
- Open runtime sessions via `connect(config) -> session_id`
- Route operational commands via `session_id`
- Support `disconnect`, `get_connection_status`, and `reconnect_session`
- Support optional SSH tunnel setup in backend connection flow
- Support group management via `list_groups`, `save_group`, `delete_group`

### 2) Query execution

The system must:

- Execute SQL through `execute_query(session_id, sql, params?)`
- Support paginated table browse via `fetch_rows` and `fetch_count`
- Support cancellation via `cancel_query(session_id)`
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

- Support staged grid edits and commit through `save_changes`
- Support row SQL generation via `generate_row_sql`
- Support file export via `export_to_file`
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

- Load `.capabilities.json` sidecar files for each driver DLL at plugin load time
- Expose 7 boolean capability flags: `supportsSqlEditor`, `supportsSchemas`, `supportsCollections`, `supportsDdl`, `supportsInlineEdit`, `supportsImportExport`, `supportsStructureView`
- Fall back to all-SQL-true defaults when sidecar is missing
- Expose capabilities to frontend via `list_drivers` and `get_driver_capabilities` commands
- Gate UI features (SQL editor, structure view, DDL, import/export) behind capability checks

### 7) MongoDB workflows

The system must:

- Connect via `mongodb://` or `mongodb+srv://` with optional authentication
- Execute `find()` queries with JSON filter, sort, and limit (no aggregation pipeline in ABI v1)
- Flatten BSON documents to tabular rows with sample-based column discovery
- Scan databases and collections for sidebar browsing
- Hide SQL editor, structure view, DDL, and import/export via capability gating

### 8) Redis workflows

The system must:

- Connect via `redis://` or `rediss://` with optional password and TLS (rustls)
- Parse and execute CLI commands (40+ operations)
- Browse keys via SCAN with Key|Type|TTL|Value columns
- Handle all Redis data types: string, hash, list, set, sorted set, stream
- Support write operations: SET, DEL, RENAME, EXPIRE, HSET, LPUSH, SADD, ZADD
- Support database switching (SELECT 0-15)
- Hide SQL editor, schema, structure, DDL, import/export via capability gating

### 9) Tab state persistence

The system must:

- Persist editor tab state to backend JSON file (`%APPDATA%/TablePro/tab-state.json`) via `TabStateStore`
- Perform one-time migration from localStorage on startup
- Clean up stale tabs on restore
- Expose `get_tab_state`, `set_tab_state`, `mark_localstorage_migrated` commands

### 10) Command model and deep-links

The system must:

- Maintain centralized command registry (21 namespaced `COMMAND_DEFINITIONS` in `useCommandRegistry.ts`)
- Support customizable keyboard shortcuts with conflict detection and swap (`useShortcutStore`)
- Support quick switcher with grouped/ranked results and fuzzy scoring
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

- Support bulk insert via `bulk_insert` (TSV paste + CSV file, 500-row batches, 50MB cap)
- Support bulk update via `bulk_update` with structured filter builder (10 operators, no freeform WHERE)
- Preview affected rows via `bulk_update_preview`
- Wrap operations in transactions with partial failure reporting

### 14) Stored procedure execution

The system must:

- Execute routines via `execute_routine` with string param inputs and backend type casting
- Preview generated SQL via `preview_routine_sql`
- Retrieve source code via `get_routine_source`
- Block system procedures via denylist (xp_cmdshell, pg_terminate_backend, etc.)

### 15) Onboarding

The system must:

- Show first-launch 3-step dialog (welcome, add connection, keyboard shortcuts)
- Support draft mode connection form (no zombie connections on cancel)

### 16) Internationalization

The system must:

- Use i18next + react-i18next for UI string translation
- Ship English and Vietnamese locale files
- Provide language selector in Settings with immediate switching (no restart)

## Non-functional requirements

### Performance

- UI must stay responsive during pagination and large result display
- Backend command handlers must keep lock scopes short
- File and SQLite operations must run in blocking wrappers (`spawn_blocking` / `block_in_place`)
- Query results are truncated at `MAX_RESULT_ROWS = 50,000` with `truncated` flag and `totalRowCount` on `QueryResult`

### Reliability

- Rust commands return `Result<_, AppError>` and avoid panics in normal flow
- Plugin adapter guards FFI paths with `catch_unwind` where implemented
- Health monitor emits connection-loss events; reconnect is per-connection with `reconnectingIds: Set<string>` guard (no auto-reconnect loops)
- Tab state persists to backend file for crash resilience

### Security

Current storage behavior in source:

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- History: `data_dir/TablePro/history.sqlite3`
- Tab state: `config_dir/TablePro/tab-state.json` (backend `TabStateStore`, migrated from localStorage)

Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are encrypted at rest using Windows DPAPI (`services/credential_store.rs`) and stored as `dpapi:`-prefixed values. Legacy plaintext is auto-migrated.

### Observability

- Runtime logs use `tracing`
- Renderer error logging command (`log_renderer_error`) is exposed
- Query execution emits progress/completion/error events

## Windows plugin ABI requirements

Host-side plugin loading must continue to use:

- `tablepro_plugin_init(vtable_ptr)` for host-allocated `PluginVTable`
- API version check against `tablepro_plugin_sdk::API_VERSION`
- `tablepro_plugin_metadata()` for plugin identity (`type_id`, `display_name`, `default_port`)
- Plugin discovery from executable-adjacent `plugins/` directory with fallback scan in executable directory for `driver_*` / `driver-*` DLLs
- Capability sidecar loading: `driver-capabilities/{dll_name}.capabilities.json` loaded at DLL load time, fallback to all-SQL-true defaults

## Acceptance criteria snapshot

| Area | Status | Evidence |
|---|---|---|
| Session-based command flow | Implemented | `commands/query.rs`, `services/connection_manager.rs` |
| Plugin ABI (`tablepro_plugin_init`) | Implemented | `plugin/manager.rs` |
| Capability substrate (sidecar) | Implemented | `driver-capabilities/*.capabilities.json`, `models/capability.rs` |
| History SQLite + FTS | Implemented | `storage/history_store.rs` |
| Tab state persistence (backend) | Implemented | `storage/tab_state_store.rs`, `commands/tab_state.rs`, `stores/tab-state-persistence.ts` |
| DPAPI secret encryption | Implemented | `services/credential_store.rs`, `storage/connection_store.rs` |
| AI chat + inline suggestions | Implemented | `commands/ai.rs`, `services/ai_provider.rs`, frontend AI components/stores |
| Health monitor + per-connection reconnect | Implemented | `services/health_monitor.rs`, `commands/connection.rs`, `stores/connectionStore.ts` |
| Payload guardrails | Implemented | `commands/query.rs` (`MAX_RESULT_ROWS`), `models/query.rs` (`truncated`, `totalRowCount`) |
| MongoDB driver | Implemented | `driver-mongodb/`, `components/mongodb/mongodb-query-panel.tsx` |
| Redis driver | Implemented | `driver-redis/`, `components/redis/redis-command-panel.tsx` |
| Command registry + shortcuts | Implemented | `hooks/useCommandRegistry.ts`, `stores/useShortcutStore`, `settings-shortcuts.tsx` |
| Deep-link protocol | Implemented | `utils/deep-link-handler.ts`, `tauri-plugin-deep-link` in `lib.rs` |
| Quick switcher | Implemented | `components/layout/quick-switcher.tsx` |
| Error classifier + recovery hints | Implemented | `ipc/error.ts`, `hooks/useToast.ts` |
| EXPLAIN query viewer | Implemented | `commands/explain.rs`, `components/editor/explain-panel.tsx` |
| Bulk insert/update | Implemented | `commands/bulk_ops.rs`, `components/grid/bulk-*-dialog.tsx` |
| Stored procedure execution | Implemented | `commands/routine_ops.rs`, `components/procedures/` |
| First-launch onboarding | Implemented | `components/onboarding/` |
| i18n (EN + VI) | Implemented | `i18n/index.ts`, `i18n/locales/en.json`, `i18n/locales/vi.json` |

## Constraints and decisions

- Documentation describes repository reality, not intended future state
- Platform claims must state that Windows is the only supported platform — no macOS code or reference target remains
- Security claims must stay aligned with storage code

## Requirement change log

- **2026-04-08**: Added error classifier, EXPLAIN viewer, bulk operations, stored procedure execution, onboarding, i18n. Updated acceptance criteria.
- **2026-04-04**: Added MongoDB, Redis, capability substrate, tab persistence backend, command registry, deep-links, payload guardrails, customizable shortcuts. Updated acceptance criteria.
- **2026-04-02**: Refreshed requirements for current command surface including AI and health/reconnect flows.
- **2026-03-18**: Session-based model, plugin ABI, DPAPI encryption, async I/O migration.

---

**Last Updated**: 2026-04-08  
**Document Status**: Active  
**Source Scope**: repository-root runtime + docs alignment
