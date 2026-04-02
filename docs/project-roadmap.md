# TablePro Project Roadmap

> **Last Updated**: 2026-04-02
> **Roadmap Baseline**: Windows pre-release branch with manifest version `0.2.0`

## Platform Status

| Platform | Status | Stack |
|---|---|---|
| macOS | Stable upstream/reference line for parity checks | SwiftUI + AppKit + native plugin bundles |
| Windows | Active implementation target (pre-release) | Tauri v2 + Rust + React/TypeScript + DLL plugins |
| Linux | Planned | Intended to follow the Tauri stack |

## Recent completed work (Windows)

| Sprint | Date | Scope | Status |
|---|---|---|---|
| P0 - Core Port | 2026-03-12 | Foundation runtime, plugin loader, initial drivers, query/editor basics | Complete |
| P1 - Feature Parity Batch | 2026-03-16 | SSH tunnel, SQL import, XLSX export, groups, schema switching, safe mode, shortcuts | Complete |
| Optimize & Harden v1 | 2026-03-18 | DPAPI secret encryption, SQL quoting fixes, async I/O hardening, modularization | Complete |
| P2 - Quick Wins | 2026-03-18 | Auto-updater integration, URL import, tags, copy-as-SQL, filter presets, create table/alter flows | Complete |
| UI/UX Redesign | 2026-03-19 | Layout refresh, status bar, semantic tokens, sidebar grouping, tab colors | Complete |
| Audit & Harden v2 | 2026-03-28 | SSH TOFU, graceful shutdown path, export timeout, schema timeout, lint/CI improvements | Complete |
| v0.3.0 development stream | 2026-04-01 | AI chat + inline suggestions + provider routing + schema context + health monitor + reconnect flow | Complete |

## Current Windows capability map (implemented)

| Area | Current state |
|---|---|
| Drivers | PostgreSQL, MySQL, SQL Server, SQLite wired in Windows runtime |
| Connection | Save/list/delete, test, connect/disconnect, groups, tags/colors, session-based runtime IDs |
| Query | Execute/cancel, paginated browse, progress events, approximate count |
| Data grid | Inline edit, staged changes, undo/redo, save changes, copy-as-SQL, enum picker, FK navigation |
| Editor | Syntax highlight, autocomplete, formatting, Vim mode, multi-tab with persistence |
| Import/Export | SQL/SQL.gz import preview+execute; CSV/JSON/SQL/XLSX export |
| Structure | Columns/indexes/FKs/DDL, create table flow, alter table generation/apply |
| History | SQLite + FTS search, recent queries, delete/clear |
| Security | DPAPI for stored secrets, SSH known_hosts TOFU verification |
| Reliability | Connection health monitor (30s ping), reconnect command, shutdown cleanup |
| AI | Chat streaming, inline suggestions, provider/model settings, schema-context support, conversation persistence |
| Updater | Tauri updater plugin for release builds |

## Remaining roadmap (planned)

### v1.1 - Post-launch parity and licensing

| Priority | Item | Notes |
|---|---|---|
| High | Licensing backend + signature verification | Parity with macOS licensing model |
| High | License settings UI | Activation/deactivation and status display |
| Medium | Health monitor auto-reconnect policy tuning | Current reconnect is user-triggered |

### v1.2 - Driver expansion

| Priority | Item | Notes |
|---|---|---|
| High | MongoDB driver | Different document/grid workflow complexity |
| High | Redis driver | Key-value and TTL workflows |
| Medium | Oracle driver | OCI dependencies and packaging constraints |
| Medium | ClickHouse driver | HTTP protocol and metadata differences |
| Medium | DuckDB driver | File-based analytics workflow |
| Low | Redshift variant support | PostgreSQL-compatible with metadata differences |

### v1.3 - Platform polish

| Priority | Item | Notes |
|---|---|---|
| High | Move tab persistence from localStorage to backend file persistence | Better crash resilience + larger payload handling |
| High | IPC payload chunking/streaming for very large result sets | Reduce single-payload pressure |
| Medium | SSH agent auth + ssh config parsing | Pageant/OpenSSH agent parity |
| Medium | Deep-link URL scheme | `tablepro://` style launch flows |
| Medium | Sidebar virtualization | Large-schema performance improvements |
| Low | Custom keyboard shortcut mapping | User-configurable bindings |

### v2.0 - Platform expansion

| Priority | Item | Notes |
|---|---|---|
| High | Linux packaging (AppImage/deb/rpm) | CI/release matrix expansion |
| Medium | Plugin distribution/registry workflow | Download/install/update plugins |
| Low | Windows file association for `.sqlite` | Optional OS integration |

## Decision log (updated)

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-12 | Use Tauri v2 + Rust for Windows app | Native runtime + shared cross-platform path |
| 2026-03-16 | Use `russh` for SSH tunnel stack | Pure Rust, async-native integration |
| 2026-03-18 | Encrypt saved credentials with DPAPI | Native Windows-at-rest secret protection |
| 2026-03-18 | Keep session-based backend command model | Stable runtime identity independent of saved IDs |
| 2026-04-01 | Ship AI + health monitor in current stream | Features are implemented and no longer roadmap-only |
| 2026-04-02 | Keep roadmap baseline tied to manifest version `0.2.0` | Avoid mismatch between docs and app metadata |

## Tracking notes

- This roadmap intentionally separates implemented state from planned backlog.
- If command surfaces or release versioning changes, update this file with evidence from:
  - `tablepro-windows/package.json`
  - `tablepro-windows/src-tauri/tauri.conf.json`
  - `tablepro-windows/src-tauri/src/lib.rs`

---

**Document Status**: Active
