# TablePro Project Roadmap

> **Last Updated**: 2026-03-28
> **Current State**: Windows v1.0-rc — 95% feature-complete for core workflows

## Platform Status

| Platform | Status | Stack |
|----------|--------|-------|
| **macOS** | Stable release | SwiftUI + AppKit + Swift plugin bundles |
| **Windows** | v1.0-rc (active) | Tauri v2 + Rust + React/TypeScript + DLL plugins |
| **Linux** | Planned | Same Tauri stack as Windows |

---

## Completed Sprints (Windows)

| Sprint | Date | Scope | Status |
|--------|------|-------|--------|
| P0 — Core Port | 2026-03-12 | Foundation, plugin loader, 4 drivers, CRUD, editor, history, filter, inspector | ✅ Complete |
| P1 — Feature Parity | 2026-03-16 | SSH tunnel, SQL import, XLSX export, groups, schema switching, FK nav, safe mode, shortcuts | ✅ Complete |
| Optimize & Harden v1 | 2026-03-18 | DPAPI encryption, SQL quoting, async I/O, OOM fixes, modularization | ✅ Complete |
| P2 — Quick Wins | 2026-03-18 | Auto-updater, URL import, tags, copy-as-SQL, ENUM picker, approx count, filter presets, create table, preview tabs | ✅ Complete |
| UI/UX Redesign | 2026-03-19 | Full UI overhaul — run split-button, status bar, design tokens, semantic colors, welcome page, sidebar groups, tab colors | ✅ Complete |
| Audit & Harden v2 | 2026-03-28 | SSH TOFU, graceful shutdown, export timeout, sidebar debounce, schema timeout, dirty tab confirm, ESLint, CI lint+signing | ✅ Complete |

## Verification (2026-03-28)

| Check | Result |
|-------|--------|
| `cargo clippy --workspace -D warnings` | ✅ 0 warnings |
| `cargo test --workspace` | ✅ 157 passed |
| `npx vitest run` | ✅ 141 passed |
| `npx eslint .` | ✅ 0 errors, 43 warnings |
| `npm run build` (tsc + vite) | ✅ Clean |

---

## Current Feature Matrix: macOS → Windows

### ✅ Fully Ported (core workflows — ship-ready)

| Category | Features |
|----------|----------|
| **Drivers** | PostgreSQL, MySQL, MSSQL, SQLite (4/10) |
| **Connection** | Connect/disconnect, test, save/delete, URL import, groups, tags, colors, database switching, schema switching, startup commands, environment badges |
| **Query** | Execute single/all, cancel, paginated fetch, progress events, approximate count |
| **Data Grid** | Virtual scroll, column resize/sort, row selection, cell editing, change tracking, undo/redo, save changes, visual indicators, copy-as-SQL, ENUM picker, FK navigation |
| **SQL Editor** | Syntax highlighting, schema-aware autocomplete, Vim mode, formatting, multi-tab, toggle comment, select-next, statement detection |
| **Sidebar** | Table/view/function/procedure tree, column expansion, search filter (deferred), database dropdown, schema dropdown, context menu |
| **Export** | CSV, JSON, SQL, XLSX with progress + streaming + timeout fallback |
| **Import** | SQL/SQL.gz with preview, transaction wrap, FK disable, progress |
| **Structure** | Columns, indexes, foreign keys, DDL view, create table wizard, alter table |
| **Inspector** | Row detail panel (both query and table-browse modes) |
| **Filter** | Quick filter bar, WHERE clause builder, filter presets save/load/delete |
| **History** | SQLite FTS5 search, recent queries, delete/clear |
| **Settings** | General, editor, appearance (light/dark/system), safe mode (6 levels) |
| **Security** | DPAPI password encryption, SSH TOFU known_hosts |
| **SSH** | Tunnel (password + key file), known_hosts fingerprint verification |
| **Shortcuts** | Full keyboard shortcut coverage + help dialog (F1) |
| **CI/CD** | GitHub Actions: clippy, tests, vitest, ESLint, Vite build, MSI/NSIS, code signing template |
| **Auto-Updater** | Tauri updater plugin (release builds) |
| **Polish** | Preview tabs, confirm discard dirty tabs, ping on tab switch, error boundary, graceful shutdown |

### ❌ Not Ported — Grouped by Priority

#### v1.0 Blockers (0 items)
> None — all v1 requirements met.

#### v1.1 — High-Value Parity (post-launch)

| # | Feature | macOS Source | Effort | Notes |
|---|---------|-------------|--------|-------|
| 1 | **AI Chat panel** | `Views/AIChat/`, `Core/AI/` | L | AIChatPanelView, message rendering, code blocks |
| 2 | **AI inline suggestions** (ghost text) | `InlineSuggestionManager.swift` | L | Ghost text overlay in editor, multi-provider |
| 3 | **AI provider config** | `AIProviderFactory.swift`, `AISettingsView.swift` | M | OpenAI, Anthropic, Gemini, Ollama + API key storage |
| 4 | **AI schema context** | `AISchemaContext.swift` | M | Feed table/column metadata into AI prompts |
| 5 | **Connection health monitor** (auto-reconnect) | `ConnectionHealthMonitor.swift` | M | Periodic ping + exponential backoff reconnect. Frontend listener already wired |
| 6 | **Licensing system** | `LicenseManager.swift`, `LicenseAPIClient.swift`, `LicenseSignatureVerifier.swift` | L | Offline-first, signature verification, 7-day revalidation, grace period |
| 7 | **License settings UI** | `LicenseSettingsView.swift`, `LicenseStorage.swift` | M | Activation, status display, deactivation |

#### v1.2 — Driver Expansion

| # | Driver | macOS Plugin | Effort | Notes |
|---|--------|-------------|--------|-------|
| 8 | **MongoDB** | `MongoDBDriverPlugin/` | XL | NoSQL key-value browsing, document editing, different grid paradigm |
| 9 | **Redis** | `RedisDriverPlugin/` | L | Key-value browsing, TTL, CLI mode |
| 10 | **Oracle** | `OracleDriverPlugin/` | L | OCI-based, separate installer |
| 11 | **ClickHouse** | `ClickHouseDriverPlugin/` | M | HTTP protocol, query progress, parts view (`ClickHousePartsView.swift`) |
| 12 | **DuckDB** | `DuckDBDriverPlugin/` | M | File-based, CSV/Parquet query |
| 13 | **Redshift** | (via PostgreSQL variant) | S | Wire-compatible with PG, minor metadata differences |

#### v1.3 — Platform Polish

| # | Feature | macOS Source | Effort | Notes |
|---|---------|-------------|--------|-------|
| 14 | **Tab state → %APPDATA%** | `TabDiskActor.swift` | M | Replace localStorage with IPC-backed file persistence |
| 15 | **IPC payload chunking** | — | L | Stream large result sets via Tauri events instead of single JSON |
| 16 | **SSH agent auth** (Pageant) | `SSHTunnelManager.swift` | M | Windows Pageant/OpenSSH agent integration |
| 17 | **SSH config parser** | `SSHConfigParser.swift` | M | Parse `~/.ssh/config` for host aliases |
| 18 | **Multi-hop SSH** (ProxyJump) | — | M | Chain tunnels |
| 19 | **Deep link URL scheme** | `AppDelegate+ConnectionHandler.swift` | M | `tablepro://connect?host=...` |
| 20 | **Sidebar virtualization** | — | M | `@tanstack/react-virtual` for 500+ tables (dep already installed) |
| 21 | **Connection URL export** | — | S | Copy connection as URL string |
| 22 | **Custom keyboard shortcuts** | `KeyboardSettingsView.swift`, `ShortcutRecorderView.swift` | M | User-configurable key bindings |
| 23 | **MQL export** | `MQLExportPlugin/` | S | MongoDB insertMany syntax (requires MongoDB driver) |
| 24 | **Sidebar table operations** | `TableOperationDialog.swift` | S | Truncate, drop, rename from context menu |
| 25 | **Data grid settings** | `DataGridSettingsView.swift` | S | Row height, font size, null display |
| 26 | **History settings** | `HistorySettingsView.swift` | S | Max entries, auto-clear, retention |
| 27 | **Multi-row edit** | `MultiRowEditState.swift` | M | Batch edit selected rows |

#### v2.0 — Platform Expansion

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 28 | **Linux packaging** (AppImage/deb/rpm) | L | Same Tauri codebase, CI matrix expansion |
| 29 | **Plugin marketplace** | XL | Download/install driver plugins from registry |
| 30 | **Windows file association** (.sqlite) | S | Registry entry for double-click .sqlite opens TablePro |

### ➖ macOS-Only (NOT porting)

| Feature | Reason |
|---------|--------|
| NSWindow native tabs | Windows has custom tab bar |
| .tableplugin bundle format | Windows uses .dll + PluginVTable |
| Sparkle auto-updater | Tauri updater replaces it |
| Touch ID | Future: Windows Hello |
| NSVisualEffectView vibrancy | Windows uses own styling |
| Homebrew Cask | Windows has MSI/NSIS |
| Onboarding flow | `OnboardingContentView.swift` — different UX paradigm on Windows |

---

## Milestone Timeline

```
v1.0 (Now)     ████████████████████████████████████ 100% — SHIP READY
                All core workflows, 4 drivers, SSH, security, CI

v1.1 (Q2 2026) ░░░░░░░░░░░░░░░░ AI + Licensing + Health Monitor
                #1-7: AI chat/inline/providers + license system + auto-reconnect

v1.2 (Q3 2026) ░░░░░░░░░░░░ Driver Expansion
                #8-13: MongoDB, Redis, Oracle, ClickHouse, DuckDB, Redshift

v1.3 (Q3 2026) ░░░░░░░░ Platform Polish
                #14-27: SSH agent, deep links, virtualization, custom shortcuts

v2.0 (Q4 2026) ░░░░ Linux + Plugin Marketplace
                #28-30: Linux packaging, marketplace, file associations
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-12 | Tauri v2 + Rust for Windows | Cross-platform, native perf, same plugin model |
| 2026-03-16 | `russh` over `ssh2` | Pure Rust, no C deps, 16x faster build, async-native |
| 2026-03-16 | `rust_xlsxwriter` for XLSX | Pure Rust, streaming, good perf |
| 2026-03-18 | DPAPI for credential encryption | Windows-native, no external deps |
| 2026-03-18 | Defer MongoDB/Redis to v1.2 | Different grid paradigm, XL effort |
| 2026-03-18 | Defer AI features to v1.1 | Needs provider config UI + API key management first |
| 2026-03-28 | v1.0 ship-ready declared | 157 Rust tests + 141 TS tests + 0 clippy warnings |
| 2026-03-28 | Tab state stays in localStorage for v1.0 | Low risk, survives restarts |
| 2026-03-28 | ESLint warnings allowed (not blocking) | 43 warnings are non-critical (unused vars, react-compiler rules) |
