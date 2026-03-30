---
title: "TablePro Windows Port - Full Implementation Plan"
description: "Phased plan to port TablePro to Windows via Tauri v2 + Rust + TypeScript + CodeMirror 6"
status: completed
priority: P1
effort: 16-22w (1-3 devs)
branch: feat/windows-port
tags: [windows, tauri, rust, port, cross-platform]
created: 2026-03-12
---

# TablePro Windows Port - Execution Plan

## Decision Record (Fixed Inputs)

| Decision | Value |
|----------|-------|
| Architecture | Tauri v2 shell + Rust core + TypeScript/React frontend |
| Editor | CodeMirror 6 (replaces CodeEditSourceEditor) |
| DB Drivers | Rust native via `libloading` DLL plugins |
| Priority Drivers | PostgreSQL, MySQL, SQL Server |
| Feature Scope | Full user-visible parity with macOS v0.17 |
| Enterprise | Offline-only at runtime (no phone-home) |
| Team | 1-3 developers |
| Timeline | 3-6 months |
| Packaging | MSI/NSIS installer, offline-capable |

## Architecture Overview

See: [phase-01-foundation.md](./phase-01-foundation.md) for detailed module map.

```
┌─────────────────────────────────────────────────────────┐
│  Tauri v2 WebView (Edge/WebView2)                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  React + TypeScript Frontend                      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │  │
│  │  │ Sidebar  │ │ DataGrid │ │ CodeMirror 6     │  │  │
│  │  │ (tree)   │ │ (virtual)│ │ (SQL editor)     │  │  │
│  │  └──────────┘ └──────────┘ └──────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ Zustand stores (connection, query, settings) │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └───────────────────────┬───────────────────────────┘  │
│                          │ Tauri IPC (invoke/events)     │
│  ┌───────────────────────┴───────────────────────────┐  │
│  │  Rust Backend (src-tauri/)                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │  │
│  │  │ Commands │ │ Services │ │ Plugin Manager   │  │  │
│  │  │ (IPC)    │ │ (core)   │ │ (libloading)     │  │  │
│  │  └──────────┘ └──────────┘ └────────┬─────────┘  │  │
│  │                                      │            │  │
│  │  ┌──────────────────────────────────┐│            │  │
│  │  │ Driver Plugins (.dll)            ││            │  │
│  │  │ ┌────────┐ ┌───────┐ ┌────────┐ ││            │  │
│  │  │ │Postgres│ │ MySQL │ │ MSSQL  │ ││            │  │
│  │  │ └────────┘ └───────┘ └────────┘ ││            │  │
│  │  └──────────────────────────────────┘│            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Phase Summary

| # | Phase | Duration | Gate | Status |
|---|-------|----------|------|--------|
| 1 | Foundation & Scaffolding | 3 weeks | Tauri app boots, IPC works | ✅ completed |
| 2 | Rust Core & Plugin System | 4 weeks | 3 drivers connect+query | ✅ completed |
| 3 | SQL Editor (CodeMirror 6) | 3 weeks | Multi-cursor, autocomplete, vim | ✅ completed |
| 4 | Data Grid & CRUD | 3 weeks | Edit/save/undo parity | ✅ completed |
| 5 | Feature Parity (remaining) | 3 weeks | All macOS features covered | ✅ completed |
| 6 | Polish, Packaging & QA | 2-4 weeks | Benchmark gates pass, MSI ships | ✅ completed |

**Total: 18-22 weeks** (with overlap, compressible to 14-16w with 3 devs)

## Staffing Split (2 devs baseline, 3 ideal)

| Role | Dev 1 (Rust) | Dev 2 (Frontend) | Dev 3 (Swing) |
|------|-------------|-------------------|---------------|
| Phase 1 | Tauri scaffold, Rust core | React scaffold, component lib | - |
| Phase 2 | Driver plugins, plugin mgr | IPC bindings, connection UI | Driver #3 (MSSQL) |
| Phase 3 | SQL formatting, completion data | CodeMirror integration | Vim mode testing |
| Phase 4 | CRUD operations, transactions | DataGrid, cell editors | Import/export |
| Phase 5 | SSH tunnel, licensing | Remaining views | Docs, QA |
| Phase 6 | Installer, offline packaging | Polish, accessibility | E2E tests |

## Benchmark Gates (Pass/Fail)

| Metric | Target | Fail Threshold | When |
|--------|--------|----------------|------|
| Cold start | < 3s | > 5s | Phase 1 |
| Idle RAM | < 150 MB | > 250 MB | Phase 1 |
| 100K row fetch + render | < 2s | > 5s | Phase 4 |
| Query execution (local PG) | < 50ms overhead | > 200ms | Phase 2 |
| Editor keystroke latency | < 16ms (60fps) | > 50ms | Phase 3 |
| Autocomplete popup | < 100ms | > 300ms | Phase 3 |
| MSI installer size | < 80 MB | > 150 MB | Phase 6 |
| CPU idle (connected, no query) | < 2% | > 5% | Phase 4 |

## Fallback Trigger Criteria

Pivot decisions if these conditions occur:

| Trigger | Condition | Fallback Action |
|---------|-----------|-----------------|
| WebView2 render perf | DataGrid > 100ms for 10K rows after optimization | Switch to Slint/GPUI native grid |
| DLL plugin ABI instability | > 3 ABI-related crashes in testing | Embed drivers statically, drop plugin model |
| CodeMirror vim gaps | > 5 vim commands impossible to implement | Ship without vim, add in v1.1 |
| Tiberius MSSQL blockers | Auth/TLS failures on enterprise SQL Server | Use ODBC via `odbc-api` crate instead |
| Timeline slip > 6 weeks | Any phase > 2x estimated duration | Cut scope: ship PG+MySQL only, defer MSSQL |
| RAM > 300MB idle | After 2 optimization passes | Profile WebView2 allocation, consider Wry patches |

## Out-of-Scope / YAGNI List

**Will NOT be in v1 Windows release:**

- macOS build from this codebase (macOS stays Swift)
- Linux support (defer to v2)
- MongoDB, Redis, ClickHouse, Oracle, DuckDB, SQLite drivers (v1.1+)
- AI chat / inline AI suggestions
- Plugin registry / download-from-web plugins
- Sparkle auto-update (use Tauri updater instead)
- Touch/tablet UI
- Theme editor / custom theme creation
- Localization (English-only for v1)
- Connection color picker (cosmetic)
- Pre-connect shell scripts (Windows security concern)
- Query plan visualization (EXPLAIN visual)
- Deep link / URL scheme handling

**Explicitly deferred but planned for v1.1:**
- SQLite, ClickHouse drivers
- SSH tunnel support (complex on Windows)
- AI features
- Import from CSV/SQL files
- Plugin registry (download additional drivers)
- Vietnamese localization

## Risk Register

See: [risk-register.md](./risk-register.md)

## Detailed Phases

- [Phase 1: Foundation & Scaffolding](./phase-01-foundation.md)
- [Phase 2: Rust Core & Plugin System](./phase-02-rust-core-plugins.md)
- [Phase 3: SQL Editor](./phase-03-sql-editor.md)
- [Phase 4: Data Grid & CRUD](./phase-04-data-grid-crud.md)
- [Phase 5: Feature Parity](./phase-05-feature-parity.md)
- [Phase 6: Polish, Packaging & QA](./phase-06-packaging-qa.md)
