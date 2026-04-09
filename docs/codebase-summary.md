# TablePro Codebase Summary

## Repository summary

This summary reflects current repository structure as of 2026-04-08.

## Top-level structure

```text
TablePro/
├── tablepro-windows/        # Active Windows app (Tauri v2 + Rust + React)
├── TablePro/                # Upstream/reference macOS app source
├── Plugins/                 # Upstream/reference macOS plugin sources + shared plugin kit
├── Libs/                    # Upstream/reference native/static libraries
├── docs/                    # Product and engineering docs
├── plans/                   # Planning artifacts and reports
├── scripts/                 # Build/release utilities
├── CHANGELOG.md
├── README.md
└── AGENTS.md
```

## Active implementation area: `tablepro-windows/`

### Backend (`tablepro-windows/src-tauri/`)

```text
src-tauri/
├── src/
│   ├── lib.rs                   # Tauri setup, state injection, command registration
│   ├── main.rs
│   ├── commands/                # Connection/query/schema/import/export/history/filter/settings/data/structure/ai/tab_state/explain/bulk_ops/routine_ops
│   ├── services/                # Connection manager, health monitor, AI, import/export helpers, SQL generators, SSH
│   ├── plugin/                  # Plugin manager + FFI adapter layers
│   ├── storage/                 # Connection/settings/history/filter/AI chat/tab state persistence
│   └── models/                  # App/domain models + AppError + DriverCapabilities
├── plugin-sdk/                  # Shared plugin SDK crate
├── driver-postgres/             # PostgreSQL DLL plugin
├── driver-mysql/                # MySQL DLL plugin
├── driver-mssql/                # SQL Server DLL plugin
├── driver-sqlite/               # SQLite DLL plugin
├── driver-mongodb/              # MongoDB DLL plugin (7 source files)
├── driver-redis/                # Redis DLL plugin (11 source files)
└── driver-capabilities/         # Sidecar capability JSON files (one per driver)
```

Verified runtime facts:

- Commands are registered centrally in `src-tauri/src/lib.rs`
- Query/schema/data flows are session-based (`session_id`)
- Query results are truncated at `MAX_RESULT_ROWS = 50,000` with `truncated`/`totalRowCount` on `QueryResult`
- Health monitor and per-connection reconnect guard are wired (`services/health_monitor.rs`, `commands/connection.rs`)
- AI command surface is wired in backend (`commands/ai.rs`)
- Tab state persists to backend JSON via `TabStateStore` (`storage/tab_state_store.rs`, `commands/tab_state.rs`)
- Driver capability substrate loads sidecar `.capabilities.json` files at DLL load time
- Deep-link support via `tauri-plugin-deep-link` registered in `lib.rs`
- Plugin host loads DLLs through `PluginManager` with:
  - host-allocated `PluginVTable`
  - `tablepro_plugin_init`
  - `tablepro_plugin_metadata`
  - `API_VERSION` compatibility check
  - plugin discovery near executable with fallback scanning for `driver_*` / `driver-*`
  - sidecar capability JSON loading from `driver-capabilities/` directory

### Driver crates (6 total)

| Driver | Crate | type_id | Port | Protocol |
|---|---|---|---|---|
| PostgreSQL | `driver-postgres` | `postgres` | 5432 | SQL |
| MySQL | `driver-mysql` | `mysql` | 3306 | SQL |
| SQL Server | `driver-mssql` | `mssql` | 1433 | SQL |
| SQLite | `driver-sqlite` | `sqlite` | - | SQL (file) |
| MongoDB | `driver-mongodb` | `mongodb` | 27017 | BSON/find() |
| Redis | `driver-redis` | `redis` | 6379 | CLI commands |

### Frontend (`tablepro-windows/src/`)

```text
src/
├── App.tsx
├── components/              # Layout/editor/grid/filter/inspector/settings/AI/mongodb/redis/shared/procedures/onboarding/connection
├── stores/                  # Zustand stores (connection/query/schema/change/editor/filter/history/settings/ai/shortcut/tab-state)
├── ipc/                     # Typed invoke wrappers + command helpers + error classifier
├── hooks/                   # useAutoUpdater, useConnectionEvents, useQueryProgress, useCommandRegistry, useKeyboardShortcuts, useToast, etc.
├── i18n/                    # i18next setup + locale files (en.json, vi.json)
├── editor/
├── types/                   # Including capability.ts
└── utils/                   # Including deep-link-handler.ts
```

Verified frontend state facts:

- Saved connection ID -> runtime session UUID mapping is in `connectionStore.sessionIds`
- Per-connection reconnect guard via `connectionStore.reconnectingIds: Set<string>`
- Editor tabs persist via backend `TabStateStore` (JSON file); frontend adapter in `stores/tab-state-persistence.ts`
- One-time migration from localStorage `tablepro-editor-tabs` to backend on startup
- History state/actions are in `stores/history.ts`
- Update checks are handled in `hooks/useAutoUpdater.ts` (release builds)
- AI UI/state are implemented under `components/ai/` and `stores/aiStore.ts`
- Command registry: 21 namespaced definitions in `hooks/useCommandRegistry.ts`
- Customizable shortcuts: `useShortcutStore` with click-to-rebind, conflict detection, per-binding/bulk reset
- Quick switcher: grouped/ranked results with fuzzy scoring in `components/layout/quick-switcher.tsx`
- Deep-link handler: `utils/deep-link-handler.ts` routes `tablepro://open/connection/{id}`
- MongoDB UI: `components/mongodb/mongodb-query-panel.tsx` (collection selector + JSON filter/sort/limit)
- Redis UI: `components/redis/redis-command-panel.tsx` (CLI input) + `redis-database-selector.tsx` (db 0-15)
- Driver capabilities: `types/capability.ts` types, schema store gates fetches behind capability checks
- Error classifier: `ipc/error.ts` exports `classifyError` with kind-based recovery hints; consumed by stores and toast system
- EXPLAIN viewer: `components/editor/explain-panel.tsx` and `explain-node.tsx` render engine plan trees
- Bulk operations: `components/grid/bulk-insert-dialog.tsx` (TSV/CSV), `bulk-update-dialog.tsx` (structured filter builder)
- Stored procedures: `components/procedures/procedure-execute-dialog.tsx`, `procedure-source-panel.tsx`, `sidebar-routine-node.tsx`
- Onboarding: `components/onboarding/` (5 components: dialog, step, welcome, add-connection, quick-start)
- Connection tags: `components/connection/connection-tag-filter.tsx` (chip bar), `connection-tag-picker.tsx` (color picker)
- i18n: `i18n/index.ts` bootstraps i18next; locale files in `i18n/locales/` (en.json, vi.json); language selector in Settings

## Storage and persistence (current behavior)

### Windows backend

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- Tab state: `config_dir/TablePro/tab-state.json`
- History DB: `data_dir/TablePro/history.sqlite3`
- AI chat DB: `data_dir/TablePro/ai_chat.sqlite3`

### Frontend

- Tab state: backend JSON via IPC (migrated from localStorage `tablepro-editor-tabs`)
- Shortcut overrides: persisted via `useShortcutStore`
- Update check throttle: localStorage key `tablepro:last-update-check`

Security reality from code:

- Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are persisted as `dpapi:`-prefixed encrypted payloads via `services/credential_store.rs`
- Legacy plaintext values are migrated to DPAPI format during persistence

## Command surface summary (backend)

Current command groups registered in `lib.rs`:

- Connection: `test_connection`, `connect`, `disconnect`, `get_connection_status`, `reconnect_session`
- Capability: `list_drivers`, `get_driver_capabilities`
- Query: `execute_query`, `fetch_rows`, `fetch_count`, `cancel_query`
- Schema: `fetch_tables`, `fetch_columns`, `fetch_indexes`, `fetch_foreign_keys`, `fetch_routines`, `fetch_databases`, `fetch_ddl`, `switch_database`, `fetch_schemas`, `fetch_enum_values`, `fetch_approximate_count`
- Storage: `list/save/delete_connection`, group CRUD
- Data mutation: `save_changes`, `generate_row_sql`
- Filter: `save_filter_preset`, `load_filter_presets`, `delete_filter_preset`
- Structure: `create_table`, `generate_alter_sql_command`, `apply_alter`
- Import/Export: `import_preview`, `import_sql_file`, `export_to_file`
- History: `history_fetch_recent`, `history_search`, `history_clear_all`, `history_delete_entry`, `history_record`
- Tab state: `get_tab_state`, `set_tab_state`, `mark_localstorage_migrated`
- Settings/diagnostics: `get_settings`, `set_settings`, `log_renderer_error`
- AI: chat stream/cancel, inline suggestions, schema context, model/provider probes, conversation CRUD
- Explain: `explain_query` (runs EXPLAIN for PG/MySQL/MSSQL/SQLite, returns parsed tree)
- Bulk ops: `bulk_insert`, `bulk_update` (structured filter builder, transaction-wrapped batches)
- Routines: `execute_routine`, `get_routine_source`, `list_routines` (with system denylist)

## Documentation stale-risk map

Areas most likely to drift:

1. Plugin ABI, loader sequence, and capability sidecar loading (`plugin/manager.rs`, `plugin/adapter.rs`, `driver-capabilities/`)
2. Tauri command registration (`lib.rs`)
3. Storage/security claims (`storage/connection_store.rs`, `storage/tab_state_store.rs`, `services/credential_store.rs`, `storage/ai_chat_store.rs`)
4. Frontend store/component paths under `src/stores/**`, `src/components/**`, and `src/hooks/**`
5. Driver crate count and capability sidecar files (`driver-capabilities/*.capabilities.json`)

---

**Last Updated**: 2026-04-08  
**Source of Truth for this summary**: direct reads of `tablepro-windows/` and docs
