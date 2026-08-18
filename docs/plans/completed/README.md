# Completed Execution Plans

Individual plan documents in this directory are local working notes and are
gitignored (see `docs/plans/README.md`). This index is the tracked, shared
record of finished bodies of work — it points at git history rather than
restating it. Run `git show <sha>` or `git log --oneline <range>` for detail.

Dates below are commit-author dates (`git log -1 --format=%ai <sha>`), Asia/
Bangkok. All work listed happened 2026-08-16 through 2026-08-18, ~60 commits
total (`git rev-list --count da418dcb..898ee781` = 71, spanning slightly
before and after that window).

## Upstream detachment and repository flattening

`da418dcb..c56e76f3` (2026-08-17 10:43 -> 17:15)

Removed the inherited macOS/iOS Swift/AppKit codebase, the `upstream` git
remote, and all but 5 of the inherited tags (`git tag | wc -l` = 5 today).
Moved the Windows app from `tablepro-windows/` to the repository root, which
is why CI ran for the first time in the repo's history — GitHub Actions only
reads `.github/workflows/` at the repo root. Rewrote root docs (CLAUDE.md,
AGENTS.md, CONTRIBUTING.md) and purged Mintlify pages describing upstream-only
or never-built features (a `sql-favorites` page, nested connection groups).
Key commits: `da418dcb`, `ab39270c`, `1e3416c9`, `0946b8e8`, `8981be07`,
`205a33a6`, `77c06175` (flatten), `aeab01c1` (path fixups), `3636f4d1`,
`c56e76f3`. See `docs/decisions/0001-permanent-detachment-from-upstream.md`.

Verified: CI green post-flatten (`gh run list`, run `32114851536` and
earlier in this range all `completed success`); `git tag | wc -l` = 5;
`git ls-files | wc -l` = 597 tracked files today.

## Crash-class driver and streaming-pipeline fixes

`958ed22e..846729a8` (2026-08-18 08:28 -> 12:19, interleaved with other work
— see individual SHAs)

Four independently reproduced crash/data-corruption classes, each with a
live probe or control test: (1) rustls picks no crypto backend when both
`aws-lc-rs` and `ring` are compiled in, panicking (and `panic = "abort"`
aborting) the first TLS connection — fixed by explicit provider install
(`958ed22e`, `driver-common/src/tls.rs`, has its own unit test asserting a
provider is installed). (2) MSSQL read every column as `&str`, panicking on
any other type — replaced with a typed `format_cell` renderer
(`da59f040`, `driver-mssql/src/value_format.rs`). (3) Streaming results had
no row cap in Rust, risking OOM on a large `SELECT *` — capped via
`effective_row_cap()` before the columnar copy (`a32c675b`,
`src-tauri/src/commands/query_streaming.rs`). (4) A rows chunk above Tauri's
IPC size limit arrives on a second round-trip after the command replies,
and a `camelCase`/`snake_case` field-name mismatch plus completion-ordering
bug left the grid showing headers with zero rows (`c441adb1`, `f4ff7352`,
`a804a39c`).

Verified: `cargo test --workspace` — 350 passed, 2 ignored (CI run
`32114851536`, job "Rust tests"); `npx vitest run` — 38 files / 416 tests
passed (same run, job "TypeScript tests"); `driver-common`'s
`provider_is_available_after_ensure` unit test exercises the rustls fix
directly.

## Query cancellation, Safe Mode routing, and tab-close correctness

`205a33a6..d044cb7a` (2026-08-17 11:56 -> 21:21)

Implemented real query cancellation for PostgreSQL (`cancel_token()`) and
MySQL (`KILL QUERY` on a second connection); scoped cancellation state to the
owning tab so Stop can no longer target the wrong query (`b1cc7d64`,
`e66c0639`, `f61b55d4`); cancel a tab's in-flight query when the tab closes
(`fc136058`). Routed sidebar Drop/Truncate/Delete-All-Records through Safe
Mode, which previously bypassed it entirely (`36d094d6`); fixed view drops to
emit `DROP VIEW` instead of `DROP TABLE` (`d044cb7a`); SQLite truncate mapped
to `DELETE FROM` since SQLite has no `TRUNCATE` (`07d39fb8`).
See `docs/decisions/0005-per-tab-cancellation-with-capability-gating.md`.

Verified: `src-tauri/driver-mysql/tests/live_cancellation.rs` (live probe
asserting `KILL QUERY` leaves the session alive); `src/components/layout/
sidebar-destructive-ops.test.ts` (Safe Mode routing + DROP VIEW cases).

## Dead-code removal and the module-reachability guard

`3ca59979..3c01c16c` (2026-08-18 09:47 -> 09:53)

Deleted 21 files nothing imported (`3ca59979`: `git show --stat 3ca59979`
lists 22 changed paths, 21 deletions + 1 test file edit, `1340` lines
removed net of `5` inserted). Three features were fully coded but
unreachable — SQL import, a duplicate keyboard-shortcut dispatcher, and the
About dialog; the About dialog was wired up rather than deleted (`6ceeedd3`,
`3c01c16c`). Added `src/__tests__/module-reachability.test.ts`
(`8d8c5499`), which walks the real static+dynamic import graph from
`src/main.tsx` and fails the build on any module not reachable from it,
with an empty `ALLOWED_ORPHANS` list.

Verified: `module-reachability.test.ts` is part of the 416 vitest tests
passing in CI run `32114851536`.

## Dependency and cargo-advisory upgrades

`7fdd23ce..3d8d5423` (2026-08-17 15:17 -> 15:53)

Aligned `@eslint/js` with the pinned ESLint 9 so installs resolve
(`7fdd23ce`), upgraded dompurify to clear an XSS-bypass advisory
(`69cfe334`), upgraded vite/vitest/postcss and transitive dev deps
(`83808290`), and updated PostgreSQL/TLS/crossbeam Rust crates (`3d8d5423`).

Verified: `npm audit` (run 2026-08-18) reports 0 vulnerabilities. `cargo
audit` (run 2026-08-18, `cargo-audit 0.22.2`, installed this session — not
previously present) still reports 11 vulnerabilities with no safe upgrade
applied this pass; see `docs/plans/active/README.md` for the breakdown. This
body of work reduced the advisory count from whatever it was before
`3d8d5423` to the current 11 — the prior count was not independently
re-measured in this session (no earlier `cargo audit` output was saved).

## Local diagnostics: rotating logs and query/session metrics

`aa1e03e2..842dec18` (2026-08-18)

Release builds run with `windows_subsystem = "windows"` and no console, so a
stderr-only tracing subscriber discarded every log line in exactly the build
users run. Added a daily-rotated log file under `%LOCALAPPDATA%\TablePro\
logs\`, 7 files kept (`aa1e03e2`, `src-tauri/src/services/app_logging.rs`).
Added per-query/session metrics to `metrics.jsonl` in the same directory,
rotated at 8 MiB, schema in `docs/development/local-metrics.md` (`a5429a10`,
`842dec18`). Both are local-file-only; see
`docs/decisions/0004-no-updater-no-telemetry-local-diagnostics-only.md`.

Verified: file paths and rotation constants read directly from
`app_logging.rs` source; schema cross-checked against
`docs/development/local-metrics.md` (not duplicated here).
