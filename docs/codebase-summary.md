# TablePro Codebase Summary

## Repository summary

This summary is generated from current repository structure and a fresh Repomix snapshot (`repomix-output.xml`, generated 2026-03-18).

### Repomix snapshot (2026-03-18)

- Packed files: **1,312**
- Total tokens: **11,756,078**
- Output file: `repomix-output.xml`
- Security exclusions reported by repomix: 3 test files
- Largest token contributors are vendored/parser sources under `LocalPackages/CodeEditLanguages/.../parser.c`

> Practical note: token distribution is dominated by bundled parser sources; this inflates whole-repo token counts for LLM analysis.

## Top-level structure

```text
TablePro/
├── tablepro-windows/        # Active Windows app (Tauri v2 + Rust + React)
├── TablePro/                # macOS app source (reference for behavior/parity)
├── Plugins/                 # macOS plugin-related sources and SDK pieces
├── Libs/                    # Shared/vendor libraries used by macOS stack
├── docs/                    # Documentation (Mintlify content + engineering markdown)
├── plans/                   # Plans, reports, implementation tracking artifacts
├── scripts/                 # Utility/build scripts
├── CHANGELOG.md
├── README.md
└── AGENTS.md
```

## Active implementation area: `tablepro-windows/`

### Backend (`tablepro-windows/src-tauri/src/`)

```text
src-tauri/src/
├── lib.rs                   # Tauri setup, state injection, command registration
├── main.rs                  # Entry point
├── commands/                # 14 files — export (3), import, query, connection, filter, structure, data, ...
│   ├── export.rs            # Export orchestration + helpers
│   ├── export_formats.rs    # CSV/JSON/SQL format generators
│   ├── export_writers.rs    # File write + XLSX writer
│   ├── filter.rs            # Filter preset CRUD commands
│   ├── structure.rs         # Create table command
│   └── data.rs              # Row SQL generation command
├── services/                # 13 files — modularized by domain
│   ├── import_service.rs    # Import types + preview/execute
│   ├── import_parser.rs     # In-memory SQL statement scanner
│   ├── import_streamer.rs   # BufReader-based streaming parser
│   ├── sql_generator.rs     # SQL generation orchestrator
│   ├── sql_generator_ops.rs # INSERT/UPDATE/DELETE builders
│   ├── sql_quoting.rs       # Per-driver identifier quoting
│   ├── ddl_generator.rs     # Per-driver CREATE TABLE DDL generation
│   ├── ssh_tunnel.rs        # SSH tunnel manager
│   ├── ssh_tunnel_core.rs   # Active tunnel connection logic
│   ├── ssh_config.rs        # SSH config types + builders
│   ├── credential_store.rs  # DPAPI encrypt/decrypt for passwords
│   └── connection_manager.rs # Session registry
├── plugin/                  # 6 files — adapter split into FFI helpers
│   ├── adapter.rs           # Core PluginDriverAdapter
│   ├── adapter_ffi_helpers.rs # FFI conversion utilities
│   └── adapter_ffi_list_converters.rs # List/schema FFI converters
├── storage/                 # ConnectionStore, SettingsStore, HistoryStore, FilterStore
└── models/                  # Shared app/domain models and AppError
```

Key runtime facts verified in source:

- Commands are registered centrally in `src-tauri/src/lib.rs`
- Query/schema/data flows use **`session_id`** and `ConnectionManager` access through `tokio::sync::Mutex`
- Plugin host loads DLLs via `PluginManager` with:
  - host-allocated `PluginVTable`
  - `tablepro_plugin_init`
  - `tablepro_plugin_metadata`
  - `API_VERSION` compatibility check
  - plugin directory discovery near executable with fallback to executable directory

### Frontend (`tablepro-windows/src/`)

```text
src/
├── App.tsx
├── components/              # Layout, editor, grid, filter, inspector, settings, structure, etc.
├── stores/                  # Zustand stores (connection/query/schema/change/editor/filter/...)
├── ipc/                     # Typed `invoke` wrappers, filter-commands, and error helpers
├── editor/                  # SQL editor utilities and language helpers
├── hooks/                   # useAutoUpdater, useQueryProgress, etc.
├── types/
├── utils/                   # connection-url-parser, etc.
└── styles/
```

Key frontend state facts verified in source:

- Saved connection ID -> runtime session UUID mapping is stored in `connectionStore` (`sessionIds` map)
- Editor tabs are persisted through Zustand `persist` (`tablepro-editor-tabs` in localStorage)
- History panel state/actions are in `stores/history.ts` and call backend `history_*` commands

## Storage and persistence (current behavior)

### Windows backend

- Connections: `config_dir/TablePro/connections.json`
- Groups: `config_dir/TablePro/groups.json`
- Filter presets: `config_dir/TablePro/filter-presets.json`
- History DB: `data_dir/TablePro/history.sqlite3`
- History schema objects: `history` table + `history_fts` virtual table + triggers
- Tab persistence: frontend localStorage via Zustand middleware

Security reality from current code:

- Saved connection secrets (`password`, `ssh_password`, `ssh_key_passphrase`) are persisted as `dpapi:`-prefixed encrypted payloads via `services/credential_store.rs` and decrypted on load in `storage/connection_store.rs`
- Legacy plaintext values are still readable on load and auto-migrated to DPAPI format during persistence

## Command surface summary (backend)

Current command groups registered in `lib.rs`:

- Connection: `test_connection`, `connect`, `disconnect`, `get_connection_status`
- Query: `execute_query`, `fetch_rows`, `fetch_count`, `cancel_query`
- Schema: `fetch_tables`, `fetch_columns`, `fetch_indexes`, `fetch_foreign_keys`, `fetch_databases`, `fetch_ddl`, `switch_database`, `fetch_schemas`, `fetch_enum_values`, `fetch_approximate_count`
- Storage: `list/save/delete_connection`, group CRUD
- Data mutation: `save_changes`, `generate_row_sql`
- Filter: `save_filter_preset`, `load_filter_presets`, `delete_filter_preset`
- Structure: `create_table`
- Import/Export: `import_preview`, `import_sql_file`, `export_to_file`
- History: `history_fetch_recent`, `history_search`, `history_clear_all`, `history_delete_entry`, `history_record`
- Settings: `get_settings`, `set_settings`, `log_renderer_error`

## Documentation stale-risk map

Areas most likely to drift and require periodic refresh:

1. Plugin ABI and loader sequence (`plugin/manager.rs`, `plugin/adapter.rs`)
2. Query command signatures (`commands/query.rs`)
3. Storage/security claims (`storage/connection_store.rs`, `storage/history_store.rs`, frontend stores)
4. Frontend file naming and component tree changes in `src/components/**`

---

**Last Updated**: 2026-03-19  
**Source of Truth for this summary**: `repomix-output.xml` + direct reads of active Windows source files