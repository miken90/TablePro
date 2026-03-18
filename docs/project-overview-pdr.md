# TablePro Product Development Requirements (PDR)

## Purpose

This document defines current product requirements for the TablePro repository as of 2026-03-18, based on implemented code in `tablepro-windows/` and current docs.

## Product scope

TablePro is a desktop database client with:

- A stable macOS codebase (`TablePro/`, read-only in this repo workflow)
- An active Windows codebase (`tablepro-windows/`, Tauri v2 + Rust + React)

Windows implementation status in source:

- Core Tauri runtime, IPC command surface, and plugin loader are implemented
- Session-based query/schema/data flows are implemented (`session_id`)
- SQLite-backed query history and frontend tab persistence are implemented
- Release and parity items (for full cross-platform goals) remain roadmap-driven

## Functional requirements

### 1) Connection management

The system must:

- Save and list connections via `list_connections`, `save_connection`, `delete_connection`
- Open runtime sessions via `connect(config) -> session_id`
- Route operational commands through `session_id` (not static connection handles)
- Support optional SSH tunnel setup in backend connection flow
- Support group management via `list_groups`, `save_group`, `delete_group`

### 2) Query execution

The system must:

- Execute ad-hoc SQL through `execute_query(session_id, sql, params?)`
- Support table browse pagination through `fetch_rows` and `fetch_count`
- Support query cancellation through `cancel_query(session_id)`
- Record history through `history_record` and search/fetch history through history commands

### 3) Schema exploration

The system must provide:

- Table listing (`fetch_tables`)
- Columns (`fetch_columns`)
- Indexes (`fetch_indexes`)
- Foreign keys (`fetch_foreign_keys`)
- Databases and database switching (`fetch_databases`, `switch_database`)
- DDL retrieval (`fetch_ddl`) and schema list (`fetch_schemas`)

### 4) Data editing and transfer

The system must:

- Support staged grid edits and commit path through `save_changes`
- Support file export through `export_to_file`
- Support SQL import preview/import via `import_preview`, `import_sql_file`

### 5) UI state and workflow

Frontend must maintain:

- Connection/session mapping in `connectionStore`
- Query execution state in `queryStore`
- Tab/editor state with Zustand persistence (`tablepro-editor-tabs` in localStorage)
- Query history panel state and actions in `stores/history.ts`

## Non-functional requirements

### Performance

- UI must remain responsive for paginated table browsing and large result sets
- Backend command handlers must avoid long mutex hold times (driver is cloned from manager before execute)

### Reliability

- Rust commands return `Result<_, AppError>` and avoid panics in normal flow
- Plugin adapter guards FFI calls with panic boundaries (`catch_unwind`) where implemented

### Security (current-state requirement)

Current storage reality in source code:

- Saved connection configs are written to `config_dir/TablePro/connections.json`
- Connection groups are written to `config_dir/TablePro/groups.json`
- Query history is SQLite at `data_dir/TablePro/history.sqlite3`
- Editor tabs persist in frontend localStorage (`zustand/persist`)

Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are encrypted at rest using Windows DPAPI via `services/credential_store.rs` and stored as `dpapi:`-prefixed payloads in `connections.json`. Legacy plaintext values are auto-migrated on load.

### Observability

- Runtime logging uses `tracing`
- Renderer error logging command (`log_renderer_error`) is exposed in Tauri invoke handler

## Windows plugin ABI requirements

Host-side plugin loading must continue to use:

- `tablepro_plugin_init(vtable_ptr)` entrypoint to initialize host-allocated `PluginVTable`
- API version check against `tablepro_plugin_sdk::API_VERSION`
- `tablepro_plugin_metadata()` for `type_id`, `display_name`, `default_port`
- Plugin discovery from executable-adjacent `plugins/` directory with fallback scan in executable directory for `driver_*`/`driver-*` DLLs

## Acceptance criteria status snapshot

| Area | Status | Evidence |
|---|---|---|
| Session-based command flow | Implemented | `commands/query.rs`, `services/connection_manager.rs` |
| Plugin ABI (`tablepro_plugin_init`) | Implemented | `plugin/manager.rs` |
| History SQLite + FTS | Implemented | `storage/history_store.rs` |
| Frontend tab persistence | Implemented | `stores/editorStore.ts` |
| Password-at-rest encryption for saved connections | Implemented | `services/credential_store.rs` with DPAPI, auto-migration for legacy plaintext |

## Constraints and decisions

- Documentation must represent repository state, not intended state
- Platform claims must distinguish macOS release reality from Windows development reality
- Security claims must stay aligned with current storage implementation

## Requirement change log

- **2026-03-18**: Updated to session-based query model, current plugin ABI, and current storage behavior.
- **2026-03-18**: DPAPI credential encryption implemented in `credential_store.rs`, per-driver SQL quoting, async I/O migration, import/export streaming, code modularization completed.

---

**Last Updated**: 2026-03-18  
**Document Status**: Active  
**Source Scope**: `tablepro-windows/` runtime + current docs