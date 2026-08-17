# Contributing

This is a personal, non-profit, Windows-only fork. There is one product in this repo: `tablepro-windows/` (Tauri v2 + Rust + React/TypeScript).

## Layout

```text
tablepro-windows/
├── src/                # React/TypeScript frontend
├── src-tauri/
│   ├── src/             # Tauri commands, services, storage
│   ├── driver-postgres/ # one crate per database engine
│   ├── driver-mysql/
│   ├── driver-mssql/
│   ├── driver-sqlite/
│   ├── driver-mongodb/
│   ├── driver-redis/
│   └── driver-capabilities/  # *.capabilities.json sidecars
docs/                  # product and engineering docs
plans/                 # plans and reports
```

## Build and Test

All commands run on Windows through PowerShell, from `tablepro-windows/` unless noted.

```powershell
npm ci
npm run dev:tauri
npm run test
npm run lint
```

Rust, from `tablepro-windows/src-tauri/`:

```powershell
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), single-line subject.

```text
feat: add CSV export for query results
fix: prevent crash on empty query result
docs: update keyboard shortcuts page
```

## CI

The only CI pipeline is [`tablepro-windows/.github/workflows/windows-build.yml`](tablepro-windows/.github/workflows/windows-build.yml), running the same gates above.

## License

Licensed under [AGPLv3](LICENSE).
