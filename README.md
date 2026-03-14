<p align="center">
  <img src=".github/assets/logo.png" width="128" height="128" alt="TablePro">
</p>

<h1 align="center">TablePro</h1>

<p align="center">
  A fast, native database client for macOS and Windows with built-in AI assistant.
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

TablePro is a native database client available on **macOS** and **Windows**. Connect to MySQL, MariaDB, PostgreSQL, SQLite, MongoDB, Redis, SQL Server, Redshift, Oracle, ClickHouse, and DuckDB. Features include a SQL editor with autocomplete, inline cell editing, AI assistance, data export/import, SSH tunneling, and a modular plugin system.

**macOS v0.17.0** is stable and production-ready. **Windows port** (Tauri v2 + Rust + React) is currently in development, targeting v0.20 release.

## Features

- **SQL Editor**: CodeMirror with Vim/Emacs keybindings, syntax highlighting, full-text query history
- **Inline Editing**: Point-and-click cell editing with automatic SQL generation (INSERT/UPDATE/DELETE)
- **Change Tracking**: Record all edits before committing, with undo/redo support
- **Data Export/Import**: CSV, JSON, SQL, XLSX formats with schema auto-detection
- **SSH Tunneling**: Secure access to remote databases
- **SSL/TLS Support**: Encrypted connections with certificate management
- **AI Assistant** (macOS): SQL generation, query optimization suggestions
- **Plugin System**: Extensible architecture for database drivers and export formats
- **Query History**: Full-text search with timestamp filtering
- **Multi-Tab Editor**: Persistent tab state across sessions

## Install

### macOS (Stable)

```bash
brew install --cask tablepro
```

Or download from [GitHub Releases](https://github.com/datlechin/tablepro/releases).

### Windows (In Development)

Windows support is coming soon. Pre-release builds will be available as v0.18+ releases.

## Architecture

| Platform | Status | Tech Stack |
|----------|--------|-----------|
| **macOS** | ✅ Stable (v0.17) | SwiftUI + AppKit, native plugin bundles |
| **Windows** | 🔄 In Progress | Tauri v2, Rust backend, React frontend, C-ABI plugins |
| **Linux** | 📋 Planned | Tauri v2 (same as Windows) |

**Database Drivers**: PostgreSQL, MySQL/MariaDB, SQLite, MongoDB, Redis, SQL Server, Oracle, ClickHouse, DuckDB, Redshift

## Documentation

Full documentation available at [docs.tablepro.app](https://docs.tablepro.app). For development guidelines, see:
- [Project Overview & PDR](docs/project-overview-pdr.md) — Product vision, goals, requirements
- [Codebase Summary](docs/codebase-summary.md) — Repository structure and architecture
- [Code Standards](docs/code-standards.md) — Development guidelines (Rust, TypeScript, Swift)
- [System Architecture](docs/system-architecture.md) — Technical design and data flows
- [Project Roadmap](docs/project-roadmap.md) — Release plan and milestones

## Sponsors

Thanks to these amazing people for supporting TablePro:

- **[Dwarves Foundation](https://dwarves.foundation/?ref=tablepro)**
- **[Nimbus](https://getnimbus.io?ref=tablepro)**
- **[Huy TQ](https://github.com/imhuytq)** — Apple Developer Program sponsor
- **[Unikorn](https://unikorn.vn?ref=tablepro)**

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=datlechin/TablePro&type=Date)](https://star-history.com/#datlechin/TablePro&Date)

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).

Contributions require signing a Contributor License Agreement (CLA). See [CLA.md](CLA.md) for details.
