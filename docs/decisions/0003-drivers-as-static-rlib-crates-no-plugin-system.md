# 0003 Drivers as statically compiled rlib crates, no plugin system

Date: 2026-05-22 (decided); recorded 2026-08-18

## Status

Accepted

## Context

An earlier design (commit `338c1dc6`, "feat(plugin): compile drivers into
binary...") replaced a DLL/FFI plugin architecture with the current one: six
driver crates (`driver-postgres`, `driver-mysql`, `driver-mssql`,
`driver-sqlite`, `driver-mongodb`, `driver-redis`), each `crate-type =
["rlib"]` (verified in each crate's `Cargo.toml`), statically linked into the
`tablepro-windows` binary and instantiated through
`src-tauri/src/drivers/registry.rs`'s `DriverKind` enum. There is no
`src-tauri/src/plugin/` directory and no `plugin-sdk` crate anywhere in this
repository.

This decision is recorded now, after the fact, because four documentation
verification passes found pages and architecture text describing a browsable
DLL plugin loader with runtime-discovered drivers — a system that was removed
and never rebuilt. Without a decision record, the fabricated description kept
reappearing because nothing said explicitly "this was tried and reverted."

## Decision

Drivers are Rust crates compiled into the app binary, selected at compile time
by Cargo workspace membership, and dispatched at runtime through a fixed enum
(`DriverKind`) — not discovered, loaded, or unloaded at runtime. Adding an
engine means adding a crate to the workspace and a `DriverKind` variant, not
dropping a file into a plugins folder.

## Alternatives Considered

1. DLL/cdylib plugin loader with a `plugin-sdk` — this is what the app had
   before `338c1dc6`. Reverted: cross-DLL Rust ABI stability is not
   guaranteed without a C ABI shim, which adds real complexity for an app
   with a fixed, known set of 6 engines and one maintainer who does not need
   third-party driver plugins.
2. Scripting-based driver plugins (e.g. embedded Lua/WASM) — never
   implemented; no evidence in source or history that this was seriously
   pursued.

## Consequences

Positive:

- No ABI-stability burden, no dynamic loading failure mode, no "plugin
  missing on connect" class of bug (which existed under the old design —
  see upstream commit history for `fix: clean up session and UI when driver
  plugin is missing on connect`).
- Capability gating is a static, typed lookup
  (`driver-capabilities/*.capabilities.json` sidecars embedded at build
  time), not a runtime capability negotiation.

Tradeoffs:

- Adding a 7th engine requires a full rebuild and release, not a drop-in
  file. There is no user-extensible driver mechanism.
- Nothing in the current source enforces "no plugin system" as a rule beyond
  convention — a future contributor could reintroduce dynamic loading without
  tripping any check. This decision is documentation, not a compiled-in
  guard.

## Follow-Up

- None planned. Revisit only if a real third-party-driver requirement
  appears (none exists for this personal, non-profit app today).
