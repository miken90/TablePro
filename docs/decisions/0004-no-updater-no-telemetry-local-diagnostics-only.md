# 0004 No updater, no telemetry — diagnostics stay local files

Date: 2026-08-17

## Status

Accepted

## Context

Upstream had a Sparkle-based auto-updater. An early Windows-port pass added a
Tauri updater plugin with an in-app notification (commits `96a1d68c`,
`91dc03ef`, and fixes around it). Commit `1e291826` ("chore(updater): remove
Tauri updater plugin and auto-update UI", 2026-08-17) removed it entirely.
AGENTS.md states this app has "no pricing, licensing, activation,
subscription, or telemetry — deliberately removed, out of scope." In place of
network diagnostics, this session's work added two local-only files:
`aa1e03e2` (rotating log file, `%LOCALAPPDATA%\TablePro\logs\`, 7 files kept,
`src-tauri/src/services/app_logging.rs`) and `a5429a10` (per-query/session
metrics to `%LOCALAPPDATA%\TablePro\logs\metrics.jsonl`, rotated at 8 MiB,
schema documented in `docs/development/local-metrics.md`). Both are
explicitly local: no network call is made to produce or ship them.

## Decision

TablePro ships with no auto-updater and no telemetry of any kind. Diagnostics
(logs, metrics) are written to local files only, under the user's own
`%LOCALAPPDATA%`, and never transmitted anywhere by the app.

## Alternatives Considered

1. Keep the Tauri updater — rejected: this is a personal, non-profit,
   distribute-it-yourself app; an auto-updater implies an update server and
   release-signing infrastructure this project does not want to operate or
   maintain.
2. Add opt-in crash/usage telemetry to guide development — rejected: no
   backend exists to receive it, and it does not match the project's
   deliberately non-commercial, no-tracking stance stated in AGENTS.md.

## Consequences

Positive:

- No update server, no signing-key custody risk beyond the code-signing cert
  already used for the installer, no telemetry backend to build, secure, or
  pay for.
- Users get a straightforward privacy story: nothing the app does calls home.

Tradeoffs:

- Users get no in-app notification of new releases; they must check the
  release page themselves.
- The maintainer has no crash/usage signal from real installs beyond what a
  user chooses to report manually (e.g. attaching their local log/metrics
  files) — debugging a report depends entirely on the reporter sharing those
  files.

## Follow-Up

- None planned.
