# TablePro Project Roadmap

## Overview

TablePro follows a three-phase development strategy: Phase 1 (macOS Foundation) is complete and stable. Phase 2 (Windows Port) is complete with all 6 phases finished. Phase 3 (Platform Parity) is planned for the coming months.

```
Phase 1 (v0.1–0.17)    │ Phase 2 (v0.18–0.20)  │ Phase 3 (v0.21+)
━━━━━━━━━━━━━━━━━━━    │ ━━━━━━━━━━━━━━━━━━━   │ ━━━━━━━━━━━━━━━━━━━
✅ COMPLETE             │ ✅ PHASE 6 COMPLETE  │ 📋 PLANNED
macOS Native Client    │ Windows Port (Tauri) │ Feature Parity + Linux
Stable Release         │ All 6 Phases Done    │ Cloud Sync, Cloud DBs
                        │ Ready for Testing    │ Advanced Features
```

## Phase 1: macOS Foundation (v0.1–0.17) ✅ COMPLETE

**Status**: Stable and production-ready
**Timeline**: 2023–2026-03-11
**Platform**: macOS 12+
**Architecture**: SwiftUI + AppKit, native plugin system

### Completed Features

| Feature | Release | Status |
|---------|---------|--------|
| **SQL Editor** | v0.1 | ✅ CodeMirror integration, Vim/Emacs keybindings, syntax highlighting |
| **Data Grid** | v0.2 | ✅ Virtual scrolling, inline editing, column sorting/filtering |
| **Connection Management** | v0.3 | ✅ Connection profiles, SSH tunnels, SSL/TLS, password encryption |
| **Query History** | v0.4 | ✅ Full-text search, timestamp filtering, quick access |
| **Change Tracking** | v0.5 | ✅ Inline editing, automatic SQL generation, undo/redo |
| **Export/Import** | v0.6 | ✅ CSV, JSON, SQL, XLSX, bulk insert |
| **Plugin System** | v0.7 | ✅ .tableplugin bundles, code signature verification, driver registry |
| **Database Drivers** | v0.8–0.15 | ✅ PostgreSQL, MySQL, SQLite, MongoDB, Redis, MSSQL, Oracle, ClickHouse, DuckDB |
| **AI Assistant** | v0.16 | ✅ SQL generation, query optimization suggestions (macOS 13.1+) |
| **Tabs & State** | v0.17 | ✅ Multi-tab editor, query state persistence across sessions |

### Metrics (v0.17.0)

- **Code**: ~12,000 lines of Swift
- **Plugins**: 9 database drivers + 5 export/import formats
- **Documentation**: Full feature docs, API docs, plugin registry
- **Users**: 1000+ downloads by v0.17
- **Test Coverage**: 85%+ on core logic

## Phase 2: Windows Port (v0.18–0.20) ✅ PHASE 6 COMPLETE

**Status**: All 6 development phases complete
**Timeline**: 2026-03-13 onwards (started v0.18)
**Target Release**: v1.0.0
**Platform**: Windows 10+
**Architecture**: Tauri v2, Rust + React, C-ABI plugin system

### Phase Status

- ✅ **Phase 1: Foundation** (Tauri v2 + Rust backend, 19 IPC commands, React frontend)
- ✅ **Phase 2: Driver Plugins** (PostgreSQL, MySQL, SQL Server via tokio-postgres, mysql_async, tiberius)
- ✅ **Phase 3: SQL Editor** (CodeMirror 6, schema-aware autocomplete, Vim mode, SQL formatting, multi-tab)
- ✅ **Phase 4: Data Grid & CRUD** (TanStack Virtual+Table, CellEditor, changeStore with undo/redo, sql_generator)
- ✅ **Phase 5: Settings & UI** (Settings panels, Export dialog, Structure viewer, Quick Switcher, Dark mode, Keyboard shortcuts)
- ✅ **Phase 6: QA & Packaging** (30+ Rust unit tests, 30+ Vitest tests, MSI/NSIS packaging, GitHub Actions CI)

### Phase 2 Milestones

| Milestone | Status | Target |
|-----------|--------|--------|
| **v0.18: Core Framework** | ✅ Complete | Phase 1 Done |
| **v0.19: Plugin System** | ✅ Complete | Phase 2 Done |
| **v0.20: Polish & Testing** | ✅ Complete | Phase 3-6 Done |

### v0.18 Scope (Core Framework)

**Frontend**:
- React app shell (Tauri window)
- Zustand stores (connection, query, schema, tab, change, editor)
- Connection dialog + sidebar
- SQL editor (CodeMirror 6)
- Results grid (basic virtualization)
- Settings panel

**Backend**:
- Rust app entry point
- IPC command handlers
- Storage layer (DPAPI, JSON, SQLite)
- Connection pooling
- Basic query execution (built-in SQLite driver)

**Expected**: ~3000 lines Rust, ~2000 lines React

### v0.19 Scope (Plugin System)

**Plugin Infrastructure**:
- libloading integration for DLL plugins
- PluginVTable FFI design
- Plugin adapter (FFI → Rust trait)
- Version validation
- Error propagation from plugins

**Driver Plugins**:
- PostgreSQL driver
- MySQL driver
- SQL Server driver
- Remaining drivers (MongoDB, Redis, Oracle, ClickHouse, DuckDB)

**Expected**: ~5000 lines Rust (core + plugins)

### v0.20 Scope (Polish & Testing)

**Frontend Polish**:
- Dark mode support
- Keyboard shortcuts
- Autocomplete
- Query history
- Filter presets
- Data import/export

**Backend Hardening**:
- Comprehensive error handling
- Performance optimization (pooling, streaming)
- Security audit (password encryption, SQL injection prevention)
- Logging & debugging

**Testing**:
- Unit tests for business logic
- Integration tests for IPC layer
- E2E tests for user workflows
- Performance benchmarks

**Documentation**:
- User documentation
- Plugin development guide
- API documentation

**Expected**: 500+ lines tests, updated docs

## Phase 3: Platform Parity & Expansion (v0.21+) 📋 PLANNED

**Timeline**: 2026-09-01 onwards
**Focus**: Full feature parity, Linux support, advanced features

### Objectives

- ✅ 100% feature parity between macOS and Windows
- ✅ AI assistant on Windows
- ✅ Linux support (Tauri-based)
- ✅ Cloud database support
- ✅ Enhanced collaboration features

### Phase 3 Milestones

| Milestone | Scope | Target |
|-----------|-------|--------|
| **v0.21: AI Assistant** | Windows AI chat | 2026-10-31 |
| **v0.22: Linux Support** | Tauri app for Linux | 2026-12-31 |
| **v0.23: Cloud Databases** | BigQuery, Snowflake | 2027-02-28 |
| **v1.0.0: Release** | Stable, 100% feature parity | 2027-03-31 |

### v0.21 Scope (AI Assistant)

- Windows AI chat panel (mirror macOS)
- Integration with LLM API (OpenAI / Claude)
- SQL generation from natural language
- Query optimization suggestions
- Data exploration assistant

### v0.22 Scope (Linux)

- Tauri v2 Linux target
- GTK-based window integration
- Feature parity with Windows
- AppImage packaging

### v0.23 Scope (Cloud)

- BigQuery driver
- Snowflake driver
- Redshift improvements
- Cloud authentication (OAuth, API keys)
- Connection pooling for cloud instances

### v1.0.0 Release Criteria

- ✅ All tests passing (95%+ coverage)
- ✅ Feature parity across all three platforms (macOS, Windows, Linux)
- ✅ No critical bugs
- ✅ Performance: <1s for 90% of user queries
- ✅ Security audit completed
- ✅ Documentation complete
- ✅ 10,000+ downloads
- ✅ User satisfaction: 4.5+ stars

## Development Status by Component

| Component | macOS | Windows | Linux |
|-----------|-------|---------|-------|
| **SQL Editor** | ✅ v0.17 | ✅ v0.18 | 📋 v0.22 |
| **Data Grid** | ✅ v0.17 | ✅ v0.18 | 📋 v0.22 |
| **Connection Mgmt** | ✅ v0.17 | ✅ v0.20 | 📋 v0.22 |
| **Query History** | ✅ v0.17 | ✅ v0.20 | 📋 v0.22 |
| **Change Tracking** | ✅ v0.17 | ✅ v0.20 | 📋 v0.22 |
| **Export/Import** | ✅ v0.17 | ✅ v0.20 | 📋 v0.22 |
| **Plugin System** | ✅ v0.17 | ✅ v0.19 | 📋 v0.22 |
| **PostgreSQL Driver** | ✅ v0.8 | ✅ v0.19 | 📋 v0.22 |
| **MySQL Driver** | ✅ v0.9 | ✅ v0.19 | 📋 v0.22 |
| **MSSQL Driver** | ✅ v0.13 | ✅ v0.19 | 📋 v0.22 |
| **SQLite Driver** | ✅ v0.10 | ✅ v0.18 | 📋 v0.22 |
| **MongoDB Driver** | ✅ v0.11 | 📋 v0.21 | 📋 v0.22 |
| **Redis Driver** | ✅ v0.12 | 📋 v0.21 | 📋 v0.22 |
| **Oracle Driver** | ✅ v0.14 | 📋 v0.21 | 📋 v0.22 |
| **ClickHouse Driver** | ✅ v0.15 | 📋 v0.21 | 📋 v0.22 |
| **DuckDB Driver** | ✅ v0.17 | 📋 v0.21 | 📋 v0.22 |
| **AI Assistant** | ✅ v0.16 | 📋 v0.21 | 📋 v0.22 |
| **Quick Switcher** | ✅ v0.17 | ✅ v0.20 | 📋 v0.22 |
| **SSH Tunneling** | ✅ v0.17 | 📋 v0.21 | 📋 v0.22 |
| **SSL/TLS** | ✅ v0.17 | 📋 v0.20 | 📋 v0.22 |
| **Dark Mode** | ✅ v0.17 | ✅ v0.20 | 📋 v0.22 |

## Parallel Development Plan (Phase 2)

To accelerate Phase 2 completion, work is parallelized:

```
v0.18 (Core Framework)
├─ Agent A: Frontend shell + stores
├─ Agent B: Backend IPC + storage
└─ Agent C: SQLite driver

v0.19 (Plugin System)
├─ Agent D: Plugin infrastructure + PostgreSQL
├─ Agent E: MySQL + MSSQL drivers
└─ Agent F: MongoDB + Redis + Other drivers
```

Each agent works in isolation using git worktrees to avoid conflicts.

## Testing & QA Strategy

| Phase | Focus |
|-------|-------|
| **Phase 2 (v0.18–0.20)** | Unit + integration tests, Windows-specific compatibility |
| **Phase 3 (v0.21+)** | E2E tests, cross-platform parity testing, performance benchmarks |

### Testing Targets by Version

| Version | Unit Tests | Integration Tests | E2E Tests |
|---------|------------|-------------------|-----------|
| v0.18 | 50+ | 20+ | 5+ |
| v0.19 | 100+ | 50+ | 15+ |
| v0.20 | 150+ | 100+ | 30+ |
| v1.0 | 200+ | 150+ | 50+ |

## Release Checklist (per version)

Before releasing any version:

- ✅ All tests passing
- ✅ No critical bugs (P0)
- ✅ Code coverage >85%
- ✅ Performance benchmarks: <1s queries
- ✅ Security audit for IPC, storage, passwords
- ✅ CHANGELOG.md updated
- ✅ Documentation updated
- ✅ MSI/DMG signed and notarized
- ✅ GitHub release with release notes

## Dependencies & Tech Debt

### Critical Dependencies

- **Tauri**: Keep up-to-date with v2.x releases
- **React**: Keep up-to-date with latest LTS
- **Rust**: Minimum 1.75, update quarterly
- **Node.js**: Keep on LTS version (18+)

### Known Tech Debt

| Item | Phase | Impact |
|------|-------|--------|
| Refactor plugin system for clarity | Phase 2 | Medium |
| Optimize grid rendering for 100K+ rows | Phase 2 | High |
| Consolidate error types across layers | Phase 2 | Medium |
| Add comprehensive logging | Phase 3 | Low |

## Community & Contribution Plan

### Phase 2 (Current)

- Focus: Core development by core team
- Plugin development guide published (v0.19)
- Community plugins: allowed but unsupported

### Phase 3 (Future)

- Accept community driver plugins
- Plugin registry on tablepro.app
- Bounty program for high-impact plugins
- Sponsorship program for maintainers

## Success Metrics

### Version Metrics

| Metric | v0.17 | v0.20 | v1.0 |
|--------|-------|-------|------|
| **Downloads** | 1,000 | 5,000 | 10,000 |
| **Star Rating** | 4.3/5 | 4.5/5 | 4.7/5 |
| **Test Coverage** | 85% | 90% | 95% |
| **Response Time (p95)** | <1s | <1s | <1s |
| **Uptime** | 99.5% | 99.8% | 99.9% |
| **Community Plugins** | 0 | 2 | 10+ |

### Adoption Targets

- **v0.20**: Windows launch, 2,000+ downloads
- **v1.0**: Full feature parity, 10,000+ downloads, 4.7+ stars

---

**Last Updated**: 2026-03-13 | **Current Phase**: Phase 2 (All 6 phases complete) | **Next Release**: v0.20 stabilization
