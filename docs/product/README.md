# Product Overview

TablePro is a personal, non-profit, Windows-only desktop database client
(Tauri v2 + Rust backend, React/TypeScript frontend). No pricing, licensing,
activation, subscription, or telemetry — see
`docs/decisions/0004-no-updater-no-telemetry-local-diagnostics-only.md`.

This file describes *what the app does for its user*, grounded in the driver
capability sidecars, the single authority on what each engine supports. It
does not restate architecture — see `docs/system-architecture.md` — or the
fuller feature list already maintained at the repository root `README.md`.

## Supported databases and what each one can do

Source: `src-tauri/driver-capabilities/*.capabilities.json` (verified by
direct read, 2026-08-18). A capability is `true`/`false` per driver; the
frontend gates UI on these flags rather than assuming uniform behavior across
engines.

| Capability | PostgreSQL | MySQL | SQL Server | SQLite | MongoDB | Redis |
| --- | --- | --- | --- | --- | --- | --- |
| SQL editor | yes | yes | yes | yes | no | no |
| Schemas | yes | no | yes | no | no | no |
| Collections | no | no | no | no | yes | no |
| DDL | yes | yes | yes | yes | no | no |
| Inline cell edit | yes | yes | yes | yes | no | yes |
| Import/export | yes | yes | yes | no | no | no |
| Structure view | yes | yes | yes | yes | no | no |
| Query cancellation | yes | yes | no | yes | no | no |

Query cancellation is real where marked yes: PostgreSQL uses
`client.cancel_token()`, MySQL issues `KILL QUERY` on a second connection,
SQLite uses a mutex-guarded `interrupt()`. Where marked no (MSSQL, MongoDB,
Redis) the driver returns `DriverError::Unsupported` and the UI hides the
cancel affordance rather than showing one that does nothing — see
`docs/decisions/0005-per-tab-cancellation-with-capability-gating.md`.

Per-engine connection detail (SSH tunneling, SSL mode meaning, connection URL
formats) lives in `docs/databases/*.mdx`, one page per engine — not
duplicated here.

## What is deliberately absent

- No plugin/DLL system for adding a 7th engine — drivers are compiled-in Rust
  crates. See `docs/decisions/0003-drivers-as-static-rlib-crates-no-plugin-system.md`.
- No auto-updater, no telemetry — diagnostics are local files only
  (`%LOCALAPPDATA%\TablePro\logs\`), documented in
  `docs/development/local-metrics.md`.
- No macOS/Linux build — Windows only, see
  `docs/decisions/0002-windows-only-powershell-execution.md`.

## Known product gaps

See `docs/plans/active/README.md` for the current list of open items (GUI
paths never exercised by a human, unresolved cargo advisories, etc.) and
`docs/development/upstream-parity-notes.md` for invariant/bug-class knowledge
carried forward from the pre-detachment upstream codebase.
