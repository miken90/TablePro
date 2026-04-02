<p align="center">
  <img src=".github/assets/logo.png" width="128" height="128" alt="TablePro">
</p>

<h1 align="center">TablePro</h1>

<p align="center">
  Database client with Windows as the active implementation target and macOS as upstream reference in this repo.
</p>

<p align="center">
  <a href="https://docs.tablepro.app">Documentation</a> ·
  <a href="https://github.com/datlechin/tablepro/releases">Download</a> ·
  <a href="https://github.com/datlechin/tablepro/issues">Report Bug</a>
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
</p>

<p align="center">
  <a href="README.vi.md">Tiếng Việt</a>
</p>

---

<p align="center">
  <img src=".github/assets/hero-dark.png" alt="TablePro Screenshot" width="800">
</p>

## About

TablePro is a desktop database client with two platform codebases in this repository:

- `TablePro/`: macOS app (upstream/reference in this repo workflow)
- `tablepro-windows/`: Windows app (active implementation target)

The Windows app is built with Tauri v2 + Rust + React/TypeScript and already includes core workflows: session-based query execution, schema explorer, inline editing + save changes, SQL import/export, SSH tunneling, auto-updater integration, AI chat, inline AI suggestions, and connection health monitoring.

## Platform Status

| Platform | Runtime status | Version signal in repo |
|---|---|---|
| macOS | Stable upstream/reference app in this repo workflow | `CHANGELOG.md` latest macOS release notes |
| Windows | Active pre-release implementation target | `tablepro-windows/package.json` and `src-tauri/tauri.conf.json` currently `0.2.0` |
| Linux | Planned | No production target in this repo yet |

## Windows Feature Snapshot (implemented)

- Connection management: save/list/delete, group management, session-based connect/disconnect
- Drivers currently wired for Windows runtime: PostgreSQL, MySQL, SQL Server, SQLite
- Query workflows: execute, cancel, paginated table browsing, progress events
- Data workflows: staged cell edits, SQL generation, save changes
- Import/Export: SQL import preview + execute, CSV/JSON/SQL/XLSX export
- Security: DPAPI encryption for saved connection secrets, SSH host key verification (TOFU)
- AI: chat panel (streaming), inline suggestions, provider/model settings, schema-aware context
- Reliability: health monitor with `connection:lost` / `connection:reconnected` events and reconnect action
- Updates: Tauri updater plugin enabled in release builds

## Development Documentation

- [Project Overview & PDR](docs/project-overview-pdr.md)
- [Codebase Summary](docs/codebase-summary.md)
- [System Architecture](docs/system-architecture.md)
- [Code Standards](docs/code-standards.md)
- [Project Roadmap](docs/project-roadmap.md)

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).

Contributions require signing a Contributor License Agreement (CLA). See [CLA.md](CLA.md) for details.
