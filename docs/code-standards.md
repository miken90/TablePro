# TablePro Code Standards

## 1. Purpose

These standards keep TablePro code and documentation maintainable and aligned with current repository reality.

Scope:

- Active implementation: the repository root (Rust + TypeScript)
- Documentation set: `docs/`

There is no separate Swift reference implementation in this repository — no `.swift` files or Swift project directory exist. Any prior claim of a "stable reference implementation" in Swift described something not present in this repo.

## 2. Ground rules

- Keep changes small, explicit, and testable
- Reuse existing modules before introducing new abstractions
- Match naming/casing conventions already used in each language area
- Document only behavior verified in source
- Distinguish implemented behavior from planned work in all docs

## 3. Repository-aware structure expectations

### 3.1 Windows backend (`src-tauri/`)

Current layout:

```text
src-tauri/
├── src/
│   ├── lib.rs
│   ├── main.rs
│   ├── commands/          # connection/query/query_streaming/schema/import/export/history/filter/settings/data/structure/ai/tab_state/explain/bulk_ops/routine_ops/crash/credential/connection_export/metrics
│   ├── models/            # Including capability.rs (DriverCapabilities, DriverInfo)
│   ├── drivers/           # Static driver registry: adapter.rs, conv.rs, driver_trait.rs, registry.rs
│   ├── services/          # connection_manager, ssh_tunnel, ai, import/export/sql helpers, app_logging, credential_store, credential_manager, crash_handler
│   └── storage/           # connection/settings/history/filter/ai_chat/tab_state stores
├── driver-common/         # Shared driver trait/types crate — no FFI types
├── driver-postgres/
├── driver-mysql/
├── driver-mssql/
├── driver-sqlite/
├── driver-mongodb/        # 4 source files
├── driver-redis/          # 9 source files
└── driver-capabilities/   # 6 sidecar JSONs (one per driver), embedded at build time via `include_str!`
```

There is no `plugin/` directory and no `plugin-sdk` crate — drivers are statically linked `rlib` crates, not DLLs loaded via FFI. See `docs/system-architecture.md` §4.

Rules:

- Keep Tauri command handlers in `commands/*.rs`
- Keep cross-command orchestration in `services/*.rs`
- Keep persistence concerns isolated in `storage/*.rs`
- Register commands centrally in `lib.rs`
- Keep driver-specific logic inside driver crates, not in host code

### 3.2 Windows frontend (`src/`)

Current layout:

```text
src/
├── App.tsx
├── components/            # Including mongodb/, redis/, settings/ subdirectories
├── editor/
├── hooks/                 # useAnnounce, useCommandRegistry, useFilterContext, useMainLayoutCommands, useMainLayoutShortcuts, useQueryProgress, useResizable, useTableCallbacks, useTheme
├── ipc/
├── stores/                # Including tab-state-persistence.ts, tab-stream-registry.ts, editorStatusStore.ts
├── styles/
├── types/                 # Including capability.ts
└── utils/                 # Including deep-link-handler.ts
```

`hooks/useKeyboardShortcuts.ts` is deleted — it was a duplicate shortcut dispatcher nothing imported. Global shortcuts route through `useMainLayoutShortcuts.ts` reading `useCommandRegistry.ts`. `hooks/useAutoUpdater.ts` is deleted — there is no auto-updater in this codebase.

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
- Quote generated literal values by the column's declared type via `services/sql_value_kind.rs`, not by guessing numeric-ness from the value's shape
- Preserve `session_id` command contract in query/schema/data paths
- Keep query cancellation/reconnect paths explicit (`cancel_query`, `reconnect_session`); remember cancellation support is per-engine (see `system-architecture.md` §3.17), not universal

### 5.4 Logging and observability

- Use `tracing` macros (`info!`, `warn!`, `error!`, `debug!`)
- Avoid `println!` in production paths
- Keep frontend-visible event names stable (`query:*`, `connection:lost`, `connection:reconnected`)
- Backend logs go to a rotating file (`services/app_logging.rs`), not stderr — release builds have no console

### 5.5 TLS boundary

- Any driver opening a rustls connection must call `driver_common::ensure_crypto_provider()` first (`driver-common/src/tls.rs`) — installing the crypto provider is a one-time, process-wide operation, and skipping it panics the first TLS connection in release builds

### 5.6 Driver crate structure conventions

Driver crates are statically-linked `rlib`s (see §3.1), not DLL plugins. Common module pattern:

- `lib.rs`: driver struct + `DatabaseDriver` trait implementation entry point
- `driver.rs` (where present): connect/disconnect and core driver state
- `ops_basic.rs` / `ops_schema.rs` (where present): query/data operations and schema/metadata discovery
- Additional `ops_*.rs` modules for domain-specific operations (e.g., `ops_key.rs`, `ops_hash.rs` in Redis, `cancel.rs` for MySQL's second-connection `KILL QUERY` cancellation)

File counts per driver crate are in `docs/codebase-summary.md`.

### 5.7 Capability sidecar conventions

- Each driver has a corresponding `driver-capabilities/{driver-name}.capabilities.json`, embedded into the binary at build time via `include_str!` (not read from disk at runtime)
- 8 boolean flags: `supportsSqlEditor`, `supportsSchemas`, `supportsCollections`, `supportsDdl`, `supportsInlineEdit`, `supportsImportExport`, `supportsStructureView`, `supportsQueryCancellation`
- Non-SQL drivers (MongoDB, Redis) disable SQL-specific flags and enable `supportsCollections`
- `supportsQueryCancellation` defaults to `false` unlike the other flags — a driver that doesn't declare it cannot be assumed to support server-side cancel
- A sidecar parse failure falls back to per-flag defaults, not a hard startup error

### 5.8 Command registry patterns

- All commands defined in `COMMAND_DEFINITIONS` array in `hooks/useCommandRegistry.ts` (28 entries)
- Commands are namespaced (e.g., `editor.newTab`, `connection.disconnect`)
- Default shortcuts are part of command definitions
- User overrides stored in `useShortcutStore` (Zustand persist, in `useCommandRegistry.ts`)
- `ShortcutsHelp` and settings shortcuts section derive from registry, never hardcode
- A small fixed set of commands is left to the CodeMirror keymap instead of the global dispatcher (see `system-architecture.md` §3.9) — do not add a second global handler for these

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
- Opt-in second copy in Windows Credential Manager when `remember_credentials_in_os_keychain` is enabled (`services/credential_manager.rs`)

### 7.2 Secret hygiene

- Never commit credentials, tokens, private keys, or `.env*` secrets
- Avoid logging sensitive connection fields

## 8. Testing and verification standards

For implementation changes (non-doc tasks):

- Run relevant Rust checks/tests for touched backend modules
- Run relevant TypeScript lint/tests for touched frontend modules
- `src/__tests__/module-reachability.test.ts` fails the build on any module under `src/` with no importer — do not add orphaned modules

For docs changes:

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
2. `src-tauri/src/drivers/registry.rs` — static driver construction and embedded capability sidecar loading
3. `src-tauri/src/commands/query.rs` and `commands/query_streaming.rs` — these have two different, non-overlapping row-cap mechanisms; don't conflate them
4. `src-tauri/src/commands/connection.rs` — connection loss is detected reactively from query errors, there is no health-monitor poll
5. `src-tauri/src/storage/*.rs` and frontend store persistence/security details
6. `package.json` + `src-tauri/Cargo.toml` version consistency (both currently `0.7.0`)
7. `driver-capabilities/*.capabilities.json` flag count and defaults (currently 8 flags)
8. `hooks/useCommandRegistry.ts` command definitions and shortcut mappings (currently 28 commands)

---

**Last Updated**: 2026-08-18
**Applies to**: Current repository state
