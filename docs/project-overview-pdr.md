# TablePro Product Development Requirements (PDR)

## Purpose

This document defines current product requirements for TablePro based on verified implementation state as of 2026-04-02.

## Product scope

TablePro is a desktop database client with two platform codebases, but this repository workflow targets Windows implementation:

- Reference/upstream macOS codebase: `TablePro/`
- Active implementation target: `tablepro-windows/` (Tauri v2 + Rust + React)

Windows implementation status in source:

- Tauri runtime, IPC command surface, and DLL plugin loader are implemented
- Session-based command routing (`session_id`) is implemented
- Query/schema/data workflows are implemented
- SQL import/export and staged edit save flow are implemented
- Connection health monitor, reconnect command, AI chat, and inline AI suggestions are implemented

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

## Non-functional requirements

### Performance

- UI must stay responsive during pagination and large result display
- Backend command handlers must keep lock scopes short
- File and SQLite operations must run in blocking wrappers (`spawn_blocking` / `block_in_place`)

### Reliability

- Rust commands return `Result<_, AppError>` and avoid panics in normal flow
- Plugin adapter guards FFI paths with `catch_unwind` where implemented
- Health monitor emits connection-loss events and supports reconnect command path

### Security

Current storage behavior in source:

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- History: `data_dir/TablePro/history.sqlite3`
- Editor tabs: frontend localStorage (`zustand/persist`)

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

## Acceptance criteria snapshot

| Area | Status | Evidence |
|---|---|---|
| Session-based command flow | Implemented | `commands/query.rs`, `services/connection_manager.rs` |
| Plugin ABI (`tablepro_plugin_init`) | Implemented | `plugin/manager.rs` |
| History SQLite + FTS | Implemented | `storage/history_store.rs` |
| Frontend tab persistence | Implemented | `stores/editorStore.ts` |
| DPAPI secret encryption | Implemented | `services/credential_store.rs`, `storage/connection_store.rs` |
| AI chat + inline suggestions | Implemented | `commands/ai.rs`, `services/ai_provider.rs`, frontend AI components/stores |
| Health monitor + reconnect path | Implemented | `services/health_monitor.rs`, `commands/connection.rs`, `stores/connectionStore.ts` |

## Constraints and decisions

- Documentation describes repository reality, not intended future state
- Platform claims must state that Windows is the active implementation target in this repo and macOS is upstream/reference only
- Security claims must stay aligned with storage code

## Requirement change log

- **2026-04-02**: Refreshed requirements for current command surface including AI and health/reconnect flows.
- **2026-03-18**: Session-based model, plugin ABI, DPAPI encryption, async I/O migration.

---

**Last Updated**: 2026-04-02  
**Document Status**: Active  
**Source Scope**: `tablepro-windows/` runtime + docs alignment
