# TablePro Codebase Summary

## Repository summary

This summary reflects current repository structure as of 2026-08-18. This is a Windows-only, personal, non-profit fork — the fork has permanently detached from upstream and no macOS code remains in the repo.

File counts (`git ls-files`): 545 tracked files total, 250 under `src/`, 148 under `src-tauri/` (excluding `target/`), 38 across the 6 driver crates.

## Top-level structure

```text
TablePro/                    # The only product (Tauri v2 + Rust + React)
├── src/                     # React/TypeScript frontend
├── src-tauri/               # Rust backend
├── docs/                    # Product and engineering docs
├── plans/                   # Planning artifacts and reports
├── CHANGELOG.md
├── README.md
└── AGENTS.md
```

## Active implementation area

### Backend (`src-tauri/`)

```text
src-tauri/
├── src/
│   ├── lib.rs                   # Tauri setup, state injection, command registration
│   ├── main.rs
│   ├── commands/                # connection/query/query_streaming/schema/import/export/history/filter/settings/data/structure/ai/tab_state/explain/bulk_ops/routine_ops/crash/credential/connection_export/metrics
│   ├── drivers/                 # Static driver registry: adapter.rs, conv.rs, driver_trait.rs, registry.rs
│   ├── services/                # Connection manager, SSH tunnel, AI, import/export helpers, SQL generators, logging, credential store/manager, crash handler
│   ├── storage/                 # Connection/settings/history/filter/AI chat/tab state persistence
│   └── models/                  # App/domain models + AppError + DriverCapabilities
├── driver-common/               # Shared driver trait/types crate — no FFI types (statically linked, not DLL ABI)
├── driver-postgres/             # PostgreSQL driver (rlib)
├── driver-mysql/                # MySQL driver (rlib)
├── driver-mssql/                # SQL Server driver (rlib)
├── driver-sqlite/                # SQLite driver (rlib)
├── driver-mongodb/              # MongoDB driver (rlib, 4 source files)
├── driver-redis/                # Redis driver (rlib, 9 source files)
└── driver-capabilities/         # Sidecar capability JSON files (one per driver, embedded at build time via `include_str!`)
```

There is no `plugin/` directory, no `plugin-sdk` crate, and no DLL/FFI plugin loader in this repository. All six driver crates are Cargo workspace members compiled in as `rlib` (see `src-tauri/Cargo.toml` `[lib] crate-type = ["rlib"]`) and linked into the single `tablepro-windows` binary. `src-tauri/src/drivers/registry.rs` and `driver-common/src/lib.rs` both say this explicitly in their module docs. Code identifiers still carry the historical "plugin" name in places (`PluginMetadataInfo`, `DriverRegistry::list_plugins()`, `AppError::PluginError`), but there is no dynamic loading behind them.

Verified runtime facts:

- Commands are registered centrally in `src-tauri/src/lib.rs`
- Query/schema/data flows are session-based (`session_id`)
- Query results have two independent caps, not one:
  - `execute_query` (legacy, non-streaming path): truncates at `MAX_RESULT_ROWS = 50,000` in `commands/query.rs`
  - `execute_query_streaming` (the path the query editor actually calls): caps rows at `effective_row_cap()`, sourced from the user's `store_max_rows` setting (default 100,000, clamped to `[10_000, 10_000_000]`), applied before the columnar copy — see `commands/query_streaming.rs`
- There is no health monitor and no periodic connection ping. `connection:lost` is emitted reactively from `commands/query.rs` when a query error's message matches connection-failure keywords (`connection`, `broken pipe`, `connection reset`, `not connected`)
- AI command surface is wired in backend (`commands/ai.rs`)
- Tab state persists to backend JSON via `TabStateStore` (`storage/tab_state_store.rs`, `commands/tab_state.rs`)
- Driver capability sidecars (`driver-capabilities/*.capabilities.json`) are embedded into the binary at compile time via `include_str!` in `drivers/registry.rs` — not read from disk at runtime
- Query cancellation is real per-engine, not a stub: PostgreSQL uses `client.cancel_token()`, MySQL issues `KILL QUERY <connection_id>` on a second connection (`driver-mysql/src/cancel.rs`), SQLite cancels locally; MSSQL, MongoDB, and Redis return `Unsupported` and the frontend gates the Cancel affordance off via each driver's `supportsQueryCancellation` capability flag
- A rustls crypto provider (`aws-lc-rs`) is installed explicitly and once via `driver-common/src/tls.rs::ensure_crypto_provider()` before any rustls-backed driver opens a TLS connection — without it, rustls 0.23 panics on the first TLS connection because more than one crypto backend is compiled in
- Backend logs go to a rotating daily file under `%LOCALAPPDATA%\TablePro\logs\` (`services/app_logging.rs`), because release builds set `windows_subsystem = "windows"` and have no console for a stderr subscriber to write to. Local metrics are written as JSONL to the same directory — see `docs/development/local-metrics.md` for the schema
- Connection secrets support two storage paths: Windows DPAPI (always, `services/credential_store.rs`) and an opt-in second copy in Windows Credential Manager (`services/credential_manager.rs`, gated by the `remember_credentials_in_os_keychain` setting, commands `cred_save`/`cred_load`/`cred_delete`)
- Crash dumps: a panic hook (`services/crash_handler.rs`) writes panic records to `%LOCALAPPDATA%\TablePro\crashes\`; `list_crash_dumps`/`delete_crash_dump` commands expose them to a Settings UI
- Connection export/import: `services/connection_export.rs` + `connection_export_crypto.rs` back `export_connections`, `import_connections_preview`, `confirm_import`, `build_import_link`
- Generated SQL quotes values by the column's *declared type* (`services/sql_value_kind.rs`), not by guessing numeric-ness from the value's shape — a `varchar` value like `"007"` used to be emitted unquoted and silently became `7`
- Large-export pagination only appends a `LIMIT`/`OFFSET` tail when the query already has a top-level `ORDER BY` (`services/export_paging.rs`); otherwise the export runs the query once, because PostgreSQL/MySQL make no ordering guarantee across separate executions of an unordered query

### Driver crates (6 total)

| Driver | Crate | type_id | Port | Protocol |
|---|---|---|---|---|
| PostgreSQL | `driver-postgres` | `postgres` | 5432 | SQL |
| MySQL | `driver-mysql` | `mysql` | 3306 | SQL |
| SQL Server | `driver-mssql` | `mssql` | 1433 | SQL |
| SQLite | `driver-sqlite` | `sqlite` | - | SQL (file) |
| MongoDB | `driver-mongodb` | `mongodb` | 27017 | BSON/find() |
| Redis | `driver-redis` | `redis` | 6379 | CLI commands |

Source: `src-tauri/src/drivers/registry.rs` (`DriverKind`).

### Frontend (`src/`)

```text
src/
├── App.tsx
├── components/              # ai/connection/DataGrid/editor/export/filter/grid/history/import/inspector/layout/mongodb/onboarding/procedures/redis/settings/shared/structure
├── stores/                  # Zustand stores — see list below
├── ipc/                     # Typed invoke wrappers + command helpers + error classifier
├── hooks/                   # useAnnounce, useCommandRegistry, useFilterContext, useMainLayoutCommands, useMainLayoutShortcuts, useQueryProgress, useResizable, useTableCallbacks, useTheme
├── i18n/                    # i18next setup + locale files (en.json, vi.json)
├── editor/
├── types/                   # Including capability.ts
└── utils/                   # Including deep-link-handler.ts
```

`hooks/useAutoUpdater.ts` and `hooks/useKeyboardShortcuts.ts` are both deleted — there is no auto-updater anywhere in this repo (no `tauri-plugin-updater` in `Cargo.toml`, no update-check code), and global shortcut dispatch now runs entirely through `hooks/useMainLayoutShortcuts.ts` reading `useCommandRegistry.ts`.

Verified frontend state facts:

- Saved connection ID -> runtime session UUID mapping is in `connectionStore.sessionIds`
- Per-connection reconnect guard via `connectionStore.reconnectingIds: Set<string>`
- Editor tabs persist via backend `TabStateStore` (JSON file); frontend adapter in `stores/tab-state-persistence.ts`
- One-time migration from localStorage `tablepro-editor-tabs` to backend on startup
- History state/actions are in `stores/history.ts`
- AI UI/state are implemented under `components/ai/` and `stores/aiChatStore.ts`
- Command registry: 28 namespaced definitions in `hooks/useCommandRegistry.ts` (`grep -c "id:" src/hooks/useCommandRegistry.ts`)
- Customizable shortcuts: `useShortcutStore` (exported from `useCommandRegistry.ts`) with click-to-rebind, conflict detection, per-binding/bulk reset
- Deep-link handler: `utils/deep-link-handler.ts` routes `tablepro://open/connection/{id}`
- MongoDB UI: `components/mongodb/mongodb-query-panel.tsx` (collection selector + JSON filter/sort/limit)
- Redis UI: `components/redis/redis-command-panel.tsx` — a single raw-command text input (GET/SET/SCAN/SELECT/etc., sent via `execute_query`). `redis-database-selector.tsx` is deleted (dead code sweep, `3ca59979`); there is no dedicated database-switch control — database switching is reachable only by typing `SELECT <db>` as a command
- Driver capabilities: `types/capability.ts` types, schema store gates fetches behind capability checks; capability set is 8 boolean flags (see `code-standards.md` §5.7)
- Error classifier: `ipc/error.ts` exports `classifyError` with kind-based recovery hints; consumed by stores and toast system
- EXPLAIN viewer: `components/editor/explain-panel.tsx` and `explain-node.tsx` render engine plan trees
- Bulk operations: `components/grid/bulk-insert-dialog.tsx` (TSV/CSV), `bulk-update-dialog.tsx` (structured filter builder); backend also has `bulk_delete`/`bulk_delete_preview`
- Stored procedures: `components/procedures/procedure-execute-dialog.tsx`, `procedure-source-panel.tsx`, `sidebar-routine-node.tsx`
- Onboarding: `components/onboarding/`
- i18n: `i18n/index.ts` bootstraps i18next; locale files in `i18n/locales/` (en.json, vi.json); language selector in Settings
- Editor status bar (cursor/statement position) is driven by a CodeMirror `updateListener` in `stores/editorStatusStore.ts`, not a poll — it replaced a 100ms `setInterval` that re-scanned the whole document even when nothing changed
- Per-tab query streaming ownership lives in `stores/tab-stream-registry.ts`: the owning tab key and session id are captured when a run starts, so switching tabs mid-run can never redirect that run's cancel to another tab or session
- `src/__tests__/module-reachability.test.ts` fails the build if any module under `src/` has no importer (empty allow-list) — this is what caught the 21 dead files removed in this window

Zustand stores in `src/stores/`: `aiChatStore.ts`, `changeStore.ts`, `connectionStore.ts`, `editorStatusStore.ts`, `editorStore.ts`, `filterStore.ts`, `history.ts`, `inspectorStore.ts`, `layoutStore.ts`, `queryLogStore.ts`, `queryResultStore.ts`, `queryStore.ts`, `schemaStore.ts`, `settingsStore.ts`, `structureChangeStore.ts`, `tab-state-persistence.ts`, `tab-stream-registry.ts`, `table-data-store.ts` (plus co-located `*.test.ts` files).

## Storage and persistence (current behavior)

### Windows backend

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- Tab state: `config_dir/TablePro/tab-state.json`
- History DB: `data_dir/TablePro/history.sqlite3`
- AI chat DB: `data_dir/TablePro/ai_chat.sqlite3`
- Logs: `%LOCALAPPDATA%\TablePro\logs\` (rotating daily `tracing` output + `metrics.jsonl`) — see `docs/development/local-metrics.md`
- Crash dumps: `%LOCALAPPDATA%\TablePro\crashes\`

### Frontend

- Tab state: backend JSON via IPC (migrated from localStorage `tablepro-editor-tabs`)
- Shortcut overrides: persisted via `useShortcutStore`

Security reality from code:

- Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are persisted as `dpapi:`-prefixed encrypted payloads via `services/credential_store.rs`
- Legacy plaintext values are migrated to DPAPI format during persistence
- When the user opts in (`remember_credentials_in_os_keychain` setting), passwords are additionally written to Windows Credential Manager via `services/credential_manager.rs`

## Command surface summary (backend)

Command groups registered in `lib.rs` (`tauri::generate_handler!`):

- Connection: `test_connection`, `connect`, `disconnect`, `get_connection_status`, `reconnect_session`, `list_drivers`, `get_driver_capabilities`, `list_ssh_hosts`
- Query: `execute_query`, `explain_query`, `fetch_rows`, `fetch_count`, `cancel_query`, `execute_query_streaming`
- Schema: `fetch_tables`, `fetch_columns`, `fetch_indexes`, `fetch_foreign_keys`, `fetch_routines`, `fetch_databases`, `fetch_ddl`, `switch_database`, `fetch_schemas`, `fetch_enum_values`, `fetch_approximate_count`, `create_table`, `generate_alter_sql_command`, `generate_table_operation_sql`, `apply_alter`
- Settings/diagnostics: `get_settings`, `set_settings`, `log_renderer_error`, `metrics_append`, `open_logs_folder`
- Storage: `list/save/delete_connection`, group CRUD
- Connection export/import: `export_connections`, `import_connections_preview`, `confirm_import`, `build_import_link`
- Credential (Windows Credential Manager, opt-in): `cred_save`, `cred_load`, `cred_delete`
- Data mutation: `save_changes`, `generate_row_sql`
- Filter: `save_filter_preset`, `load_filter_presets`, `delete_filter_preset`
- Structure: `create_table`, `generate_alter_sql_command`, `apply_alter`
- Import/Export: `import_preview`, `import_sql_file`, `export_to_file`
- History: `history_fetch_recent`, `history_search`, `history_clear_all`, `history_delete_entry`, `history_record`
- Tab state: `get_tab_state`, `set_tab_state`, `mark_localstorage_migrated`
- AI: chat stream/cancel, inline suggestions, schema context, model/provider probes, conversation CRUD
- Explain: `explain_query` (runs EXPLAIN for PG/MySQL/MSSQL/SQLite, returns parsed tree)
- Bulk ops: `bulk_insert`, `bulk_update`, `bulk_update_preview`, `bulk_delete`, `bulk_delete_preview` (structured filter builder, transaction-wrapped batches)
- Routines: `execute_routine`, `get_routine_source`, `preview_routine_sql`
- Crash dumps: `list_crash_dumps`, `delete_crash_dump`

## Documentation stale-risk map

Areas most likely to drift:

1. Driver registry, static linking, and embedded capability sidecars (`drivers/registry.rs`, `driver-capabilities/`)
2. Tauri command registration (`lib.rs`)
3. Storage/security claims (`storage/connection_store.rs`, `storage/tab_state_store.rs`, `services/credential_store.rs`, `services/credential_manager.rs`, `storage/ai_chat_store.rs`)
4. Frontend store/component paths under `src/stores/**`, `src/components/**`, and `src/hooks/**`
5. Query cap mechanism (`commands/query.rs` legacy path vs. `commands/query_streaming.rs` primary path)

---

**Last Updated**: 2026-08-18
**Source of Truth for this summary**: direct reads of the repository source and docs
