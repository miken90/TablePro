# TablePro Codebase Summary

## Repository summary

This summary reflects current repository structure and a fresh Repomix snapshot generated on 2026-04-02.

### Repomix snapshot (2026-04-02)

- Packed files: **1,444**
- Total tokens: **11,915,787**
- Output file: `repomix-output.xml`
- Security exclusions reported by repomix: 3 test files
- Largest token contributors are bundled parser sources under `LocalPackages/CodeEditLanguages/.../parser.c`

> Practical note: whole-repo token size is heavily inflated by vendored parser code.

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

### Backend (`tablepro-windows/src-tauri/src/`)

```text
src-tauri/src/
├── lib.rs                   # Tauri setup, state injection, command registration
├── main.rs
├── commands/                # Connection/query/schema/import/export/history/filter/settings/data/structure/ai
├── services/                # Connection manager, health monitor, AI, import/export helpers, SQL generators, SSH
├── plugin/                  # Plugin manager + FFI adapter layers
├── storage/                 # Connection/settings/history/filter/AI chat persistence
└── models/                  # App/domain models + AppError
```

Verified runtime facts:

- Commands are registered centrally in `src-tauri/src/lib.rs`
- Query/schema/data flows are session-based (`session_id`)
- Health monitor and reconnect command are wired (`services/health_monitor.rs`, `commands/connection.rs`)
- AI command surface is wired in backend (`commands/ai.rs`)
- Plugin host loads DLLs through `PluginManager` with:
  - host-allocated `PluginVTable`
  - `tablepro_plugin_init`
  - `tablepro_plugin_metadata`
  - `API_VERSION` compatibility check
  - plugin discovery near executable with fallback scanning for `driver_*` / `driver-*`

### Frontend (`tablepro-windows/src/`)

```text
src/
├── App.tsx
├── components/              # Layout/editor/grid/filter/inspector/settings/AI/shared
├── stores/                  # Zustand stores (connection/query/schema/change/editor/filter/history/settings/ai)
├── ipc/                     # Typed invoke wrappers + command helpers
├── hooks/                   # useAutoUpdater, useConnectionEvents, useQueryProgress, etc.
├── editor/
├── types/
└── utils/
```

Verified frontend state facts:

- Saved connection ID -> runtime session UUID mapping is in `connectionStore.sessionIds`
- Editor tabs persist via Zustand `persist` (`tablepro-editor-tabs`)
- History state/actions are in `stores/history.ts`
- Update checks are handled in `hooks/useAutoUpdater.ts` (release builds)
- AI UI/state are implemented under `components/ai/` and `stores/aiStore.ts`

## Storage and persistence (current behavior)

### Windows backend

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- History DB: `data_dir/TablePro/history.sqlite3`
- AI chat DB: `data_dir/TablePro/ai_chat.sqlite3`

### Frontend

- Editor tabs: localStorage via Zustand persistence middleware

Security reality from code:

- Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are persisted as `dpapi:`-prefixed encrypted payloads via `services/credential_store.rs`
- Legacy plaintext values are migrated to DPAPI format during persistence

## Command surface summary (backend)

Current command groups registered in `lib.rs`:

- Connection: `test_connection`, `connect`, `disconnect`, `get_connection_status`, `reconnect_session`
- Query: `execute_query`, `fetch_rows`, `fetch_count`, `cancel_query`
- Schema: `fetch_tables`, `fetch_columns`, `fetch_indexes`, `fetch_foreign_keys`, `fetch_routines`, `fetch_databases`, `fetch_ddl`, `switch_database`, `fetch_schemas`, `fetch_enum_values`, `fetch_approximate_count`
- Storage: `list/save/delete_connection`, group CRUD
- Data mutation: `save_changes`, `generate_row_sql`
- Filter: `save_filter_preset`, `load_filter_presets`, `delete_filter_preset`
- Structure: `create_table`, `generate_alter_sql_command`, `apply_alter`
- Import/Export: `import_preview`, `import_sql_file`, `export_to_file`
- History: `history_fetch_recent`, `history_search`, `history_clear_all`, `history_delete_entry`, `history_record`
- Settings/diagnostics: `get_settings`, `set_settings`, `log_renderer_error`
- AI: chat stream/cancel, inline suggestions, schema context, model/provider probes, conversation CRUD

## Documentation stale-risk map

Areas most likely to drift:

1. Plugin ABI and loader sequence (`plugin/manager.rs`, `plugin/adapter.rs`)
2. Tauri command registration (`lib.rs`)
3. Storage/security claims (`storage/connection_store.rs`, `services/credential_store.rs`, `storage/ai_chat_store.rs`)
4. Frontend store/component paths under `src/stores/**` and `src/components/**`

---

**Last Updated**: 2026-04-02  
**Source of Truth for this summary**: `repomix-output.xml` + direct reads of `tablepro-windows/` and docs
