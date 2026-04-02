# Contributing

## Scope

This repository's active implementation target is `tablepro-windows/`.

- **Implement here by default:** `tablepro-windows/`
- **Reference only:** `TablePro/`, `Plugins/`, `Libs/` (upstream macOS code used for parity research)

Do not use macOS/Xcode build, test, lint, or release flows unless the change explicitly targets the macOS codebase.

## Setup

```bash
git clone https://github.com/<your-username>/TablePro.git
cd TablePro
cd tablepro-windows
npm ci
```

## Build and validation

Run from `tablepro-windows/` unless noted.

```bash
npm run build
npx vitest run
npx eslint .
```

Run Rust validation from `tablepro-windows/src-tauri/`:

```bash
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

For local Tauri development:

```bash
npm run dev:tauri
```

## Porting workflow

When porting a feature from the upstream macOS app:

1. Read `TablePro/` to understand behavior, UX intent, and edge cases
2. Map that behavior to the Windows architecture in `tablepro-windows/`
3. Implement only in Windows paths unless the task explicitly includes macOS edits
4. Add or update Windows tests
5. Validate with the commands above

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/), single line, no body.

```text
feat: add CSV export for query results
fix: prevent crash on empty query result
docs: update keyboard shortcuts page
```

## Branch naming

Branch off `main`:

- `feat/add-cassandra-support`
- `fix/query-editor-crash`
- `docs/update-keyboard-shortcuts`

## Pull requests

One change per PR. Make sure validation passes and link related issues.

Before opening, check:

- [ ] Tests added or updated where behavior changed
- [ ] `CHANGELOG.md` updated under `[Unreleased]` when needed
- [ ] Docs updated in `docs/` if behavior or workflow changed
- [ ] `npx vitest run` passes for changed frontend logic
- [ ] `npx eslint .` passes for changed frontend logic
- [ ] `cargo test --workspace` passes for changed Rust logic
- [ ] `cargo clippy --workspace -- -D warnings` passes when Rust changes warrant it

## Project layout

```text
tablepro-windows/       # Active Windows app (Tauri v2 + Rust + React/TypeScript)
TablePro/               # Upstream/reference macOS app source
Plugins/                # Upstream/reference macOS plugin sources
Libs/                   # Upstream/reference native/static libraries
docs/                   # Product and engineering docs
plans/                  # Plans and reports
scripts/                # Shared utility scripts
```

## Adding a database driver

For Windows work, add new drivers under `tablepro-windows/src-tauri/driver-*` and wire them through the Windows plugin host, frontend connection types, and build scripts. Do not follow old macOS `.tableplugin` + Xcode-target instructions unless the task is explicitly about the macOS app.

## Reporting bugs

Open a [GitHub issue](https://github.com/datlechin/TablePro/issues) with:

- whether the issue is in Windows or macOS
- app version
- reproduction steps
- database type and version if relevant

## CLA

You'll need to sign the Contributor License Agreement on your first PR. The CLA bot will walk you through it.

## License

Contributions are licensed under [AGPLv3](LICENSE).
