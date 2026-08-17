# AGENTS.md

Guidance for any coding agent working in this repository.

## What this repo is

TablePro — a personal, non-profit, Windows-only desktop database client. Built
with Tauri v2 (Rust backend) + React/TypeScript (frontend). Permanently
detached fork of upstream `datlechin/TablePro` (macOS Swift/AppKit): no
`upstream` remote, no inherited tags, no macOS/Swift/Xcode code in this repo.
Windows is the only supported platform. No pricing, licensing, activation,
subscription, or telemetry — deliberately removed, out of scope.

The repo root **is** the app (flattened from a former `tablepro-windows/`
subdirectory): `src/`, `src-tauri/`, `package.json`, `index.html`,
`vite.config.ts`, `scripts/`, `docs/`, `plans/`.

## Docs are not trustworthy by default

Prior verification passes found 50-90% fabrication rates on several pages
under `docs/`. **Verify any claim against source before repeating or acting on
it** — do not trust a doc's description of a feature, setting, shortcut, or
command without checking the code. `docs/development/upstream-parity-notes.md`
tracks known behavioral defects found this way; read it before assuming a
capability works as described elsewhere.

## Layout

```
.
├── src/                       # React/TypeScript frontend
│   ├── components/
│   ├── stores/                 # Zustand state
│   ├── ipc/                    # Tauri command wrappers
│   └── hooks/
├── src-tauri/
│   ├── src/
│   │   ├── commands/            # #[tauri::command] handlers
│   │   ├── drivers/             # registry.rs, driver_trait.rs
│   │   ├── services/            # connection_manager, credential_store/manager,
│   │   │                        # sql_generator, ssh_config, ai_provider, ...
│   │   ├── storage/              # connection_store, history_store, settings_store,
│   │   │                        # tab_state_store, filter_store, ai_chat_store
│   │   └── models/
│   ├── driver-common/            # shared driver types
│   ├── driver-postgres/  driver-mysql/  driver-mssql/
│   ├── driver-sqlite/    driver-mongodb/  driver-redis/
│   └── driver-capabilities/      # *.capabilities.json sidecars
├── scripts/                     # PowerShell build/dev/release scripts
├── docs/                        # Mintlify docs (docs.json, features/, databases/,
│                                # customization/, development/, images/, journals/)
└── plans/                       # plan/report files, `YYMMDD[-HHMM]-slug/`
```

## Driver model

6 databases, each a separate Rust crate (`rlib`, statically linked into the
app binary) implementing a shared `DatabaseDriver` trait
(`src-tauri/src/drivers/driver_trait.rs`), instantiated via
`src-tauri/src/drivers/registry.rs`: PostgreSQL, MySQL/MariaDB, SQL Server,
SQLite, MongoDB, Redis. **There is no DLL/plugin loader** — that system was
removed. Each driver has a capability sidecar
(`driver-capabilities/driver-<name>.capabilities.json`) the frontend uses to
gate UI per engine.

## Environment: WSL + Windows

This session runs in WSL; the app itself only builds/runs/tests on Windows.
Use native bash for git, gh, and file operations. Run all build/test/lint/
package commands from a Windows-drive working directory (`/mnt/d/...`, never
`/home/...` — that produces a UNC path error) via `powershell.exe` or
`powershell -ExecutionPolicy Bypass -File <script>`, one native command per
invocation, piping output through `tr -d '\r'` to strip CRLF.

## Commands (`package.json` scripts, verified against `.github/workflows/windows-build.yml`)

```bash
npm ci                 # install
npm run dev             # vite dev server
npm run build            # tsc && vite build
npm run test              # vitest run
npm run lint               # eslint .
npm run dev:tauri            # scripts/dev.ps1 (Vite + `cargo run` independently —
                              #   `npm run dev:tauri:cli` is the `tauri dev --no-watch` fallback)
npm run build:debug            # scripts/build-debug.ps1
npm run build:release           # scripts/build-release.ps1
npm run build:portable            # scripts/build-release.ps1 -Target portable
npm run build:installer             # scripts/build-release.ps1 -Target installer
npx tauri build                       # full Tauri package build
powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Version X.Y.Z
```

Rust, from `src-tauri/`:

```bash
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

CI (`.github/workflows/windows-build.yml`, runs on `windows-latest`) does, in
order: `npm ci` → `cargo clippy --workspace -- -D warnings` → `cargo test
--workspace` → `npx vitest run` → `npx eslint .` → `npm run build` → code
signing (if secrets present) → `npx tauri build` → upload MSI + NSIS
artifacts. This is the actual gate set — match it rather than inventing
additional checks.

## Storage

| What | Where |
|---|---|
| Connection passwords | DPAPI-encrypted (`services/credential_store.rs`); optional additional mirror into Windows Credential Manager (`services/credential_manager.rs`), opt-in via `rememberCredentialsInOsKeychain` |
| App settings | `%APPDATA%/TablePro/settings.json` |
| Query history | `%APPDATA%/TablePro/history.sqlite3`, FTS5 search via `rusqlite` |
| Tab state | `%APPDATA%/TablePro/tab-state.json` |
| Filter presets | `%APPDATA%/TablePro/filter-presets.json` |
| Saved connections | `%APPDATA%/TablePro/connections.json`, `groups.json` |

Rust logging: `tracing` crate, structured. Never `println!()` in production
code paths.

## Crash triage

Read `memory.md` at the repo root before debugging a recurring crash — it
holds accumulated findings on this app's dev-runner vs release-exe vs
installer crash modes and where to look first (`%APPDATA%/TablePro/renderer-errors.log`,
`src-tauri/target/debug/std{out,err}.log`, Windows Event Log,
`%LOCALAPPDATA%/CrashDumps`).

## Rules

- **File naming**: kebab-case, descriptive (self-documenting for search tools).
- **File size**: consider splitting a file once it exceeds ~200 lines; check
  existing modules for the right seam before adding a new one.
- **No `unwrap()` on user/external data** — handle errors explicitly.
- Rust: fix `cargo clippy` warnings, run `rustfmt`.
- TypeScript: strict mode, functional components + hooks, Zustand for state.
- **Test-first correctness**: when a test fails, fix the source, never adjust
  the test to match broken output.
- **CHANGELOG.md**: update `[Unreleased]` for user-facing changes. Skip for
  docs-only or internal-only changes.
- **Docs**: update `docs/` (Mintlify) when behavior, commands, settings, or
  architecture actually change — verify the new text against source first.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/),
  single-line subject, no AI/Claude references.
- Don't send >1MB JSON payloads over a single Tauri `invoke` — stream in
  chunks (see `execute_query_streaming` for the pattern). Virtualize large
  lists (data grid, sidebar tree) rather than rendering full DOM for >1K
  items.

## Writing style (docs & any user-facing copy)

Write like a developer, not marketing copy. Be specific over generic. Avoid:
seamless, robust, comprehensive, intuitive, effortless, powerful (as filler),
streamlined, leverage, elevate, harness, supercharge, unlock, unleash, dive
into, game-changer, empower, delve.
