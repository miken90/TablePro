# TablePro Code Standards

## 1. Purpose

These standards keep TablePro code and documentation maintainable and aligned with current repository reality.

Scope:

- Active implementation: `tablepro-windows/` (Rust + TypeScript)
- Stable reference implementation: `TablePro/` (Swift)
- Documentation set: `docs/`

## 2. Ground rules

- Keep changes small, explicit, and testable
- Reuse existing modules before introducing new abstractions
- Match naming/casing conventions already used in each language area
- Document only behavior verified in source
- Distinguish implemented behavior from planned work in all docs

## 3. Repository-aware structure expectations

### 3.1 Windows backend (`tablepro-windows/src-tauri/`)

Current layout:

```text
src-tauri/
├── src/
│   ├── lib.rs
│   ├── main.rs
│   ├── commands/          # connection/query/schema/import/export/history/filter/settings/data/structure/ai/tab_state/explain/bulk_ops/routine_ops
│   ├── models/            # Including capability.rs (DriverCapabilities, DriverInfo)
│   ├── plugin/            # manager.rs, adapter.rs, FFI helper modules
│   ├── services/          # connection_manager, health_monitor, ai, ssh, import/export/sql helpers
│   └── storage/           # connection/settings/history/filter/ai_chat/tab_state stores
├── plugin-sdk/
├── driver-postgres/
├── driver-mysql/
├── driver-mssql/
├── driver-sqlite/
├── driver-mongodb/        # 7 source files: lib, driver, ops_basic, ops_schema, ffi_helpers, free_fns, bson_flatten
├── driver-redis/          # 11 source files: lib, driver, command_parser, ops_basic/key/hash/collection/server/schema, ffi_helpers, free_fns
└── driver-capabilities/   # 6 sidecar JSONs (one per driver)
```

Rules:

- Keep Tauri command handlers in `commands/*.rs`
- Keep cross-command orchestration in `services/*.rs`
- Keep persistence concerns isolated in `storage/*.rs`
- Register commands centrally in `lib.rs`
- Keep driver-specific logic inside driver crates, not in host code

### 3.2 Windows frontend (`tablepro-windows/src/`)

Current layout:

```text
src/
├── App.tsx
├── components/            # Including mongodb/, redis/, settings/ subdirectories
├── editor/
├── hooks/                 # Including useCommandRegistry.ts, useKeyboardShortcuts.ts
├── ipc/
├── stores/                # Including tab-state-persistence.ts
├── styles/
├── types/                 # Including capability.ts
└── utils/                 # Including deep-link-handler.ts
```

Rules:

- Keep IPC invocation in typed wrappers (`src/ipc/commands.ts`)
- Keep state by domain in `stores/*`
- Keep heavy view composition in components; move shared logic to hooks/stores
- Avoid style-only renames for mixed historical filenames unless part of a scoped cleanup

## 4. File size and modularity guidance

- Prefer code files under ~200 LOC where practical
- Keep docs markdown files under 800 LOC
- Split by responsibility boundaries, not arbitrary line count

## 5. Rust standards (Windows backend)

### 5.1 Error handling

- Return `Result<T, AppError>` across command/service boundaries
- Avoid `unwrap()` in runtime/user-controlled paths
- Prefer typed error variants over opaque string-only errors

### 5.2 Async and locking

- Use async `tokio` patterns end-to-end
- Keep mutex lock scope minimal
- Move file and SQLite operations into `spawn_blocking` or `block_in_place`
- Do not run `std::fs::*` directly in long-running async command paths

### 5.3 SQL and command safety

- Use `services/sql_quoting::quote_identifier(name, driver_type)` for dynamic identifiers
- Preserve `session_id` command contract in query/schema/data paths
- Keep query cancellation/reconnect paths explicit (`cancel_query`, `reconnect_session`)

### 5.4 Logging and observability

- Use `tracing` macros (`info!`, `warn!`, `error!`, `debug!`)
- Avoid `println!` in production paths
- Keep frontend-visible event names stable (`query:*`, `connection:lost`, `connection:reconnected`)

### 5.5 FFI/plugin boundary

- Keep ABI structs aligned with `tablepro_plugin_sdk`
- Respect vtable lifecycle and pointer ownership contracts
- Guard FFI calls when panic propagation could cross boundaries

### 5.6 Driver crate structure conventions

New driver crates follow this module pattern:

- `lib.rs`: plugin ABI exports (`tablepro_plugin_init`, `tablepro_plugin_metadata`, free functions)
- `driver.rs`: `DatabaseDriver` trait implementation, connect/disconnect
- `ops_basic.rs`: core query and data operations
- `ops_schema.rs`: schema/metadata discovery (databases, tables/collections, columns)
- `ffi_helpers.rs`: FFI serialization helpers
- `free_fns.rs`: C ABI free functions for plugin SDK
- Additional `ops_*.rs` modules for domain-specific operations (e.g., `ops_key.rs`, `ops_hash.rs` in Redis)

### 5.7 Capability sidecar conventions

- Each driver DLL must have a corresponding `driver-capabilities/{driver-name}.capabilities.json`
- 7 boolean flags: `supportsSqlEditor`, `supportsSchemas`, `supportsCollections`, `supportsDdl`, `supportsInlineEdit`, `supportsImportExport`, `supportsStructureView`
- Non-SQL drivers (MongoDB, Redis) disable SQL-specific flags and enable `supportsCollections`
- Missing sidecar triggers all-SQL-true fallback defaults

### 5.8 Command registry patterns

- All commands defined in `COMMAND_DEFINITIONS` array in `hooks/useCommandRegistry.ts`
- Commands are namespaced (e.g., `editor.newTab`, `connection.disconnect`)
- Default shortcuts are part of command definitions
- User overrides stored in `useShortcutStore` (Zustand persist)
- `ShortcutsHelp` and settings shortcuts section derive from registry, never hardcode

## 6. TypeScript/React standards (Windows frontend)

### 6.1 Types and IPC

- Prefer explicit interfaces/types in `src/types/`
- Keep `invoke` usage inside IPC wrappers
- Avoid `any` except unavoidable interop boundaries

### 6.2 Store design

- Keep Zustand stores domain-scoped (`connection`, `query`, `schema`, `history`, `settings`, `ai`, `shortcut`)
- Use explicit action names (`loadX`, `saveX`, `setX`, `connect`, `disconnect`, `reconnect`)
- Persist only restart-safe state (tabs via backend JSON, shortcut overrides, lightweight preferences)
- Tab state persistence goes through backend `TabStateStore`, not localStorage

### 6.3 Components and hooks

- Functional components with hooks
- Lift cross-feature state to stores
- Keep large pages readable by extracting subcomponents and hooks

## 7. Security and data handling standards

### 7.1 Implementation-backed security claims

Security claims in docs must match code.

Current verified behavior:

- Connection secrets are encrypted at rest with Windows DPAPI (`services/credential_store.rs`)
- Encrypted values use `dpapi:` prefix in persisted JSON
- Legacy plaintext values are auto-migrated on save

### 7.2 Secret hygiene

- Never commit credentials, tokens, private keys, or `.env*` secrets
- Avoid logging sensitive connection fields

## 8. Testing and verification standards

For implementation changes (non-doc tasks):

- Run relevant Rust checks/tests for touched backend modules
- Run relevant TypeScript lint/tests for touched frontend modules

For docs changes:

- Run docs validation: `node $HOME/.claude/scripts/validate-docs.cjs docs/`
- Fix broken links/path references before completion

## 9. Documentation standards for this repository

- Keep documentation specific, source-backed, and concise
- Use current command parameter names (`session_id`)
- Mark planned work as planned; do not present it as implemented
- Remove stale references instead of leaving unresolved placeholders

Core docs that must stay synchronized:

- `docs/project-overview-pdr.md`
- `docs/project-roadmap.md`
- `docs/codebase-summary.md`
- `docs/system-architecture.md`
- `docs/code-standards.md`
- `README.md`

## 10. Commit and review expectations

- Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, etc.)
- Keep commit message single-line in this repository workflow
- Docs-only changes usually do not require `CHANGELOG.md` updates

## 11. Stale-risk checklist

When reviewing docs/code alignment, verify these first:

1. `src-tauri/src/lib.rs` command registration and managed state
2. `src-tauri/src/plugin/manager.rs` ABI entrypoints, discovery paths, and capability sidecar loading
3. `src-tauri/src/commands/query.rs` and `commands/connection.rs` signatures/events
4. `src-tauri/src/storage/*.rs` and frontend store persistence/security details
5. `tablepro-windows/package.json` + `src-tauri/tauri.conf.json` version consistency
6. `driver-capabilities/*.capabilities.json` flag count and defaults
7. `hooks/useCommandRegistry.ts` command definitions and shortcut mappings

---

**Last Updated**: 2026-04-08  
**Applies to**: Current repository state
