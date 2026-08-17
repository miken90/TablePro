<p align="center">
  <img src="docs/logo/logo.png" width="128" height="128" alt="TablePro">
</p>

<h1 align="center">TablePro</h1>

<p align="center">
  A personal, non-profit, Windows-only database client.
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
</p>

<p align="center">
  <a href="README.vi.md">Tiếng Việt</a>
</p>

---

## About

TablePro is a Windows-only desktop database client, built with Tauri v2 + Rust + React/TypeScript. It is a personal fork detached from its upstream macOS origin — no macOS code remains in this repository.

It includes: session-based query execution, schema explorer, inline editing + save changes, SQL import/export, SSH tunneling, AI chat + inline AI, driver capability substrate, command registry with customizable shortcuts, deep-link support, and 6 compiled-in database drivers (PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, Redis). No pricing, licensing, activation, subscription, telemetry, or auto-updater — permanently out of scope.

## Platform Status

| Platform | Runtime status | Version |
|---|---|---|
| Windows | Active, only supported platform | `package.json` / `src-tauri/tauri.conf.json`, currently `0.7.0` |

## Windows Feature Snapshot (implemented)

- Connection management: save/list/delete, group management, session-based connect/disconnect, user-initiated reconnect
- Drivers: PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, Redis (6 total, compiled-in Rust crates, no plugin/DLL system)
- Driver capability substrate: sidecar `.capabilities.json` files per driver, frontend gating via `listDrivers`/`getDriverCapabilities`
- Query workflows: execute, cancel (PostgreSQL, MySQL/MariaDB, SQLite — MSSQL/MongoDB/Redis honestly gated off via `supportsQueryCancellation` in the driver capability sidecars), paginated table browsing, progress events, payload guardrails (`MAX_RESULT_ROWS = 50,000` truncation)
- MongoDB workflows: find() with JSON filter/sort/limit, collection browser, BSON-to-row flattening, sample-based column discovery
- Redis workflows: CLI command panel (36 commands across key/hash/list/set/sorted-set/stream/server ops), SCAN-based key browsing, all data types, TLS support, database switching
- Data workflows: staged cell edits, SQL generation, save changes
- Import/Export: SQL import preview + execute, CSV/JSON/SQL/XLSX export
- Security: DPAPI encryption for saved connection secrets by default, optional Windows Credential Manager mirroring, SSH host key verification (TOFU)
- AI: chat panel (streaming), inline suggestions, provider/model settings, schema-aware context
- Reliability: `connection:lost` / `connection:reconnected` events, user-initiated per-connection reconnect
- Tab state persistence: backend JSON file (`%APPDATA%/TablePro/tab-state.json`) with one-time localStorage migration
- Command registry: 21 namespaced commands, customizable keyboard shortcuts with conflict detection and swap
- Quick switcher: grouped/ranked results (tables, views, databases, schemas, recent queries), fuzzy scoring
- Deep-links: `tablepro://open/connection/{id}` and `tablepro://import?...` protocol handlers

## Development Documentation

- [Project Overview & PDR](docs/project-overview-pdr.md)
- [Codebase Summary](docs/codebase-summary.md)
- [System Architecture](docs/system-architecture.md)
- [Code Standards](docs/code-standards.md)
- [Project Roadmap](docs/project-roadmap.md)

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).
