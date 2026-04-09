# TablePro Project Roadmap

> **Last Updated**: 2026-04-08
> **Roadmap Baseline**: Windows v0.4.0 released

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
| Connection resilience + guardrails | 2026-04-03 | Per-connection reconnect guard, payload truncation (MAX_RESULT_ROWS=50K), tab state backend persistence | Complete |
| Driver capability substrate | 2026-04-03 | Sidecar .capabilities.json (7 flags), plugin manager loading, frontend gating, DriverCapabilities types | Complete |
| MongoDB vertical slice | 2026-04-03 | driver-mongodb crate, BSON flattening, find() queries, collection browser, MongoDB connection form | Complete |
| Command model + deep-links | 2026-04-03 | 21-command registry, shortcut drift fixes, deep-link protocol (tablepro://), settings shortcuts | Complete |
| Quick switcher + custom shortcuts | 2026-04-04 | useShortcutStore, click-to-rebind, conflict detection, grouped/ranked quick switcher with fuzzy scoring | Complete |
| Redis vertical slice | 2026-04-04 | driver-redis crate, CLI command parser (40+ ops), SCAN key browsing, all data types, TLS, db switching | Complete |
| v0.3.1 - Error handling & EXPLAIN | 2026-04-05 | Error classifier with recovery hints, upgraded toasts, EXPLAIN viewer (PG/MySQL/MSSQL/SQLite), i18n framework setup | Complete |
| v0.3.2 - Connections & onboarding | 2026-04-05 | Connection tag filtering with chip bar, tag management, first-launch onboarding (3-step) | Complete |
| v0.3.3 - Bulk ops & procedures | 2026-04-05 | Bulk insert/update, stored procedure execute/view source, procedure denylist, sidebar context menu | Complete |
| v0.4.0 - Localization & polish | 2026-04-05 | Full i18n migration, Vietnamese translation, language selector, immediate switching | Complete |

## Current Windows capability map (implemented)

| Area | Current state |
|---|---|
| Drivers | PostgreSQL, MySQL, SQL Server, SQLite, MongoDB, Redis (6 total, DLL plugins) |
| Driver capabilities | Sidecar `.capabilities.json` per driver (7 boolean flags), frontend gating |
| Connection | Save/list/delete, test, connect/disconnect, groups, tags/colors, tag filtering (chip bar + AND logic), session-based runtime IDs, per-connection reconnect guard |
| Query | Execute/cancel, paginated browse, progress events, approximate count, payload guardrails (50K row truncation), EXPLAIN viewer (PG/MySQL/MSSQL/SQLite) |
| MongoDB | find() with JSON filter/sort/limit, collection browser, BSON flattening, sample-based columns |
| Redis | CLI command panel (40+ ops), SCAN key browsing, all data types (string/hash/list/set/zset/stream), TLS, db 0-15 |
| Data grid | Inline edit, staged changes, undo/redo, save changes, copy-as-SQL, enum picker, FK navigation, bulk insert (TSV/CSV), bulk update (filter builder) |
| Editor | Syntax highlight, autocomplete, formatting, Vim mode, multi-tab with backend persistence |
| Import/Export | SQL/SQL.gz import preview+execute; CSV/JSON/SQL/XLSX export |
| Structure | Columns/indexes/FKs/DDL, create table flow, alter table generation/apply |
| History | SQLite + FTS search, recent queries, delete/clear |
| Security | DPAPI for stored secrets, SSH known_hosts TOFU verification |
| Reliability | Connection health monitor (30s ping), per-connection reconnect, shutdown cleanup |
| Tab persistence | Backend JSON file (`%APPDATA%/TablePro/tab-state.json`), one-time localStorage migration |
| Commands | 21 namespaced command definitions, customizable keyboard shortcuts, conflict detection + swap |
| Quick switcher | Grouped/ranked results with fuzzy scoring (exact > prefix > substring > fuzzy) |
| Deep-links | `tablepro://open/connection/{id}` protocol via `tauri-plugin-deep-link` |
| AI | Chat streaming, inline suggestions, provider/model settings, schema-context support, conversation persistence |
| Updater | Tauri updater plugin for release builds |
| Error handling | Error classifier with kind-based recovery hints, severity-aware toasts with action buttons |
| Bulk operations | Bulk insert (TSV paste + CSV drag-drop, 500-row batches), bulk update (structured filter builder, dry-run preview) |
| Stored procedures | Execute with param inputs + SQL preview, source viewer with syntax highlight, system procedure denylist |
| Onboarding | First-launch 3-step dialog (welcome, add connection, keyboard shortcuts), draft mode connection form |
| i18n | i18next + react-i18next, English + Vietnamese locales, language selector in Settings, immediate switching |

## Remaining roadmap (planned)

### v1.1 - Post-launch parity and licensing

| Priority | Item | Notes |
|---|---|---|
| High | Licensing backend + signature verification | Parity with macOS licensing model |
| High | License settings UI | Activation/deactivation and status display |
| Medium | Health monitor auto-reconnect policy tuning | Current reconnect is user-triggered, per-connection |

### v1.2 - Driver expansion

| Priority | Item | Notes |
|---|---|---|
| Medium | Oracle driver | OCI dependencies and packaging constraints |
| Medium | ClickHouse driver | HTTP protocol and metadata differences |
| Medium | DuckDB driver | File-based analytics workflow |
| Low | Redshift variant support | PostgreSQL-compatible with metadata differences |

### v1.3 - Platform polish

| Priority | Item | Notes |
|---|---|---|
| High | IPC payload chunking/streaming for very large result sets | Reduce single-payload pressure (ABI v1 has no cursor API) |
| Medium | SSH agent auth + ssh config parsing | Pageant/OpenSSH agent parity |
| Medium | Sidebar virtualization | Large-schema performance improvements |
| Low | Windows file association for `.sqlite` | Optional OS integration |

### v2.0 - Platform expansion

| Priority | Item | Notes |
|---|---|---|
| High | Linux packaging (AppImage/deb/rpm) | CI/release matrix expansion |
| Medium | Plugin distribution/registry workflow | Download/install/update plugins |

## Decision log (updated)

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-12 | Use Tauri v2 + Rust for Windows app | Native runtime + shared cross-platform path |
| 2026-03-16 | Use `russh` for SSH tunnel stack | Pure Rust, async-native integration |
| 2026-03-18 | Encrypt saved credentials with DPAPI | Native Windows-at-rest secret protection |
| 2026-03-18 | Keep session-based backend command model | Stable runtime identity independent of saved IDs |
| 2026-04-01 | Ship AI + health monitor in current stream | Features are implemented and no longer roadmap-only |
| 2026-04-02 | Keep roadmap baseline tied to manifest version `0.4.0` | Updated from 0.2.0 after v0.3.x and v0.4.0 release cycle |
| 2026-04-03 | Capability sidecar over ABI extension | Avoids ABI version bump; sidecar is additive and backward-compatible |
| 2026-04-03 | Per-connection reconnect guard (no auto-reconnect) | Prevents reconnect loops; user-initiated recovery is safer |
| 2026-04-03 | Tab state to backend JSON (not localStorage) | Better crash resilience, larger payload, cross-session portability |
| 2026-04-04 | Command registry as single source of truth for shortcuts | Eliminates shortcut drift between help panel, settings, and handlers |
| 2026-04-05 | Structured filter builder for bulk update (no freeform WHERE) | Prevents SQL injection in bulk operations |
| 2026-04-05 | System procedure denylist for routine execution | Block system-owned stored procedures for security |
| 2026-04-05 | i18next for i18n (EN + VI initial scope) | Lightweight, React-native integration, immediate language switching |

## Tracking notes

- This roadmap intentionally separates implemented state from planned backlog.
- If command surfaces or release versioning changes, update this file with evidence from:
  - `tablepro-windows/package.json`
  - `tablepro-windows/src-tauri/tauri.conf.json`
  - `tablepro-windows/src-tauri/src/lib.rs`

---

**Document Status**: Active
