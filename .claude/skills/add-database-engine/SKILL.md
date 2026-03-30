---
name: add-database-engine
description: >
  Guided implementation for adding a new database engine to TablePro Windows.
  Use this skill only for `tablepro-windows/` when asked to add a new driver,
  support a new database type, implement a Windows plugin driver, or wire a new
  engine through the Tauri + Rust + React app.
autoTrigger:
  - "add.*database.*support"
  - "new.*database.*engine"
  - "implement.*driver"
  - "add.*windows.*driver"
---

# Add New Database Engine to TablePro Windows

Use this skill only for `tablepro-windows/`.

This app loads database drivers as Windows DLL plugins through the Rust host under `src-tauri/`. A new engine is not just a new crate. It must be wired through the plugin ABI, host loader, frontend connection types, and build scripts.

## Source of truth

Read these first:
- `docs/system-architecture.md`
- `tablepro-windows/src-tauri/Cargo.toml`
- `tablepro-windows/src-tauri/plugin-sdk/src/lib.rs`
- `tablepro-windows/src-tauri/plugin-sdk/src/vtable.rs`
- `tablepro-windows/src-tauri/src/plugin/manager.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter.rs`
- One existing driver crate such as `tablepro-windows/src-tauri/driver-postgres/`

## What a new engine requires

| Layer | Create | Update |
| --- | --- | --- |
| Driver crate | `tablepro-windows/src-tauri/driver-<engine>/` | `tablepro-windows/src-tauri/Cargo.toml` |
| Plugin ABI | crate `src/lib.rs` exports | match `plugin-sdk` API version + metadata |
| Host loading | usually reuse existing host loader | only update host code if engine needs a new capability |
| Frontend type wiring | connection labels, defaults, parser, icons | `src/**` + `src-tauri/src/models/**` |
| Build scripts | include new driver in build lists | `package.json`, `scripts/*.ps1` |
| Tests | Rust crate tests + TS tests where needed | verify with workspace test pipeline |

## Phase 1: Create the driver crate

Create `tablepro-windows/src-tauri/driver-<engine>/` using the existing drivers as template.

Minimum files:
- `Cargo.toml`
- `src/lib.rs`
- extra modules only if needed

Requirements:
- crate type must be `cdylib`
- depend on `tablepro-plugin-sdk`
- export plugin entrypoints expected by the host
- report stable metadata including `type_id`, display name, and default port

Good references:
- `tablepro-windows/src-tauri/driver-postgres/src/lib.rs`
- `tablepro-windows/src-tauri/driver-mysql/src/lib.rs`
- `tablepro-windows/src-tauri/driver-mssql/src/lib.rs`
- `tablepro-windows/src-tauri/driver-sqlite/src/lib.rs`

## Phase 2: Match the plugin ABI

The host loads plugin DLLs and validates the ABI using:
- `tablepro_plugin_init`
- `tablepro_plugin_metadata`
- `API_VERSION` from `tablepro-windows/src-tauri/plugin-sdk/src/lib.rs`

Follow the vtable contract from:
- `tablepro-windows/src-tauri/plugin-sdk/src/vtable.rs`
- `tablepro-windows/src-tauri/plugin-sdk/src/types.rs`

Rules:
1. Plugin API version must match the host.
2. Strings and lists returned over FFI must use the SDK types and free callbacks.
3. Driver code must not panic across FFI boundaries.
4. Metadata `type_id` must stay stable. The host uses it to create drivers.

## Phase 3: Implement engine behavior

Implement the engine inside the driver crate using the existing drivers as pattern.

Typical responsibilities:
- connect / disconnect / ping
- execute SQL
- fetch tables
- fetch columns
- fetch indexes
- fetch foreign keys
- fetch databases
- fetch DDL
- cancel query if supported
- report whether schemas and transactions are supported

The host-side trait shape is in:
- `tablepro-windows/src-tauri/src/plugin/driver_trait.rs`

The plugin bridge behavior is in:
- `tablepro-windows/src-tauri/src/plugin/adapter.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter_ffi_helpers.rs`
- `tablepro-windows/src-tauri/src/plugin/adapter_ffi_list_converters.rs`

Only change host adapter code if the new engine needs a capability the current ABI does not expose.

## Phase 4: Register the crate in the workspace and scripts

Add the new crate to:
- `tablepro-windows/src-tauri/Cargo.toml`

Add the driver to build entrypoints:
- `tablepro-windows/package.json` (`build:drivers`)
- `tablepro-windows/scripts/dev.ps1`
- `tablepro-windows/scripts/build-debug.ps1`
- `tablepro-windows/scripts/build-release.ps1`

Expected release output pattern:
- release build emits `driver_*.dll`
- portable packaging copies DLLs into `plugins/`
- installer build includes the main app bundle via Tauri

## Phase 5: Wire the engine through frontend and backend models

A new engine is incomplete until the app can create and save connections for it.

Check these areas:
- `tablepro-windows/src/components/connection/connection-form-config.ts`
- `tablepro-windows/src/components/connection/engine-icon.tsx`
- `tablepro-windows/src/utils/connection-url-parser.ts`
- `tablepro-windows/src/types/connection.ts`
- `tablepro-windows/src-tauri/src/models/connection.rs`
- `tablepro-windows/src-tauri/src/commands/connection.rs`

Usual tasks:
- add the new `dbType`
- set default port and placeholders
- show engine icon/name in UI
- support connection URL parsing if applicable
- persist the engine type in frontend/backend models

## Phase 6: Testing

### Rust
Run from `tablepro-windows/src-tauri/`:
```bash
cargo test --workspace
```

Add driver-crate tests for parsing, config handling, result conversion, and error paths.

### TypeScript
Run from `tablepro-windows/`:
```bash
npx vitest run
npx eslint .
```

Add TS tests only where frontend wiring changed, such as connection parser, engine icon, or form defaults.

## Validation checklist

A new engine is done only when all are true:
- crate exists under `src-tauri/driver-<engine>`
- workspace includes the crate
- plugin exports match `plugin-sdk`
- host can discover and instantiate the driver by `type_id`
- frontend exposes the engine in connection flows
- build scripts include the DLL
- `cargo test --workspace` passes
- `npx vitest run` passes for changed frontend logic
- `npx eslint .` passes

## Edge cases

- Run commands from the correct directory. Rust commands usually run in `tablepro-windows/src-tauri/`. TS commands usually run in `tablepro-windows/`.
- Do not add frontend `dbType` support without backend model support.
- Do not add a driver crate without adding it to build scripts. The DLL will never ship.
- Keep `type_id` stable after release. Saved connections and plugin lookup depend on it.
- If the engine cannot support some capability, make that explicit. Do not fake support for schemas, transactions, or cancellation.

## Quick workflow

1. Copy an existing `driver-*` crate as the structural template.
2. Implement plugin exports and engine behavior.
3. Add the crate to the workspace and build scripts.
4. Wire `dbType` through frontend and backend connection models.
5. Add Rust tests and any necessary TS tests.
6. Run workspace tests and frontend validation commands.
