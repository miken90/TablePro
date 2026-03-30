# Brainstorm: macOS → Windows Conversion Gap Analysis

> Date: 2026-03-18
> Type: Gap analysis + remaining plan verification
> Status: Analysis complete

---

## Context

Verified ALL existing plans against actual codebase state. Below is the updated conversion status.

### Plans Reviewed

| Plan | Date | Status |
|------|------|--------|
| [Windows Port Architecture](file:///D:/WORKSPACES/PERSONAL/TablePro/plans/260312-1211-windows-port-architecture/plan.md) | 03-12 | ✅ Complete |
| [Windows Port Implementation (6 phases)](file:///D:/WORKSPACES/PERSONAL/TablePro/plans/260312-1226-windows-port-implementation/plan.md) | 03-12 | ✅ Complete |
| [Feature Parity Audit + P0 Features](file:///D:/WORKSPACES/PERSONAL/TablePro/plans/260314-feature-parity-audit/) | 03-14 | ✅ Complete |
| [P1 Features (10 items)](file:///D:/WORKSPACES/PERSONAL/TablePro/plans/260316-p1-features-windows/plan.md) | 03-16 | ✅ Complete |
| [Optimize & Harden (7 phases)](file:///D:/WORKSPACES/PERSONAL/TablePro/plans/260318-optimize-harden/plan.md) | 03-18 | ✅ Complete |

---

## Updated Parity Status (post-P0 + P1 + O&H)

The original parity checklist from 03-14 was at **~55% done**. After P0, P1, and Optimize & Harden, the updated status is:

### ✅ NOW DONE (were ❌ or 🔶 on 03-14)

| Feature | Completed In |
|---------|-------------|
| SQLite driver | P0 |
| Query history (Rust FTS5 backend) | P0 |
| Tab state persistence | P0 |
| Filter panel (WHERE builder) | P0 |
| Right sidebar / Inspector | P0 |
| Save changes end-to-end | P0 |
| History panel (fully wired) | P0 |
| SSH tunnel (russh) | P1 |
| SSH key + password auth | P1 |
| Import SQL (.sql, .sql.gz) | P1 |
| XLSX export | P1 |
| Connection groups/folders | P1 |
| PostgreSQL schema switching | P1 |
| FK navigation arrows | P1 |
| Full safe mode (6 levels) | P1 |
| Keyboard shortcuts (Ctrl+W, Ctrl+I, Ctrl+Tab, F1 help) | P1 |
| Tab management | P1 |
| DPAPI password encryption | O&H |
| Per-driver SQL quoting | O&H |
| Async I/O migration | O&H |
| Import/export streaming (file-side) | O&H |
| Code modularization (41 Rust files, split frontend) | O&H |

### Still ❌ MISSING — By Priority Tier

#### P2 — Important for feature completeness

| # | Feature | macOS Reference | Complexity | Notes |
|---|---------|----------------|------------|-------|
| 1 | **MongoDB driver** | `MongoDBDriverPlugin/` | XL (2-3w) | NoSQL with key-value browsing, BSON handling. Needs different grid rendering |
| 2 | **Redis driver** | `RedisDriverPlugin/` | L (1-2w) | Key-value + CLI mode. Fundamentally different UI from SQL |
| 3 | **Connection URL import** | `ConnectionFormView.swift` | S (1-2d) | Parse `mysql://`, `postgresql://`, `mssql://` strings into form fields |
| 4 | **Connection tags/environment labels** | `ConnectionTagEditor.swift` | S (1d) | Tag connections with env (prod/staging/dev), show colored badge |
| 5 | **Connection color picker** | `ConnectionColorPicker.swift` | S (0.5d) | Color-code connections, tint toolbar |
| 6 | **Copy as INSERT/UPDATE SQL** | Results context menu | M (2-3d) | Right-click row → copy as SQL statement |
| 7 | **ENUM/SET picker** | Cell editor dropdown | M (2-3d) | MySQL ENUM/SET → dropdown picker in cell editing |
| 8 | **Query progress events** | IPC events | M (2d) | Real-time query execution progress to frontend |
| 9 | **Approximate row count** | DB metadata query | S (1d) | Instant count from `pg_stat_user_tables` / `INFORMATION_SCHEMA` |
| 10 | **Quick search (row filter bar)** | `QuickSearchField` | S (1d) | Already have Filter panel; this is simplified text-search bar |
| 11 | **Filter presets** | `FilterSettingsStorage.swift` | M (2d) | Save/load filter configurations |
| 12 | **Create Table wizard** | `StructureView` | L (3-5d) | Visual GUI for CREATE TABLE DDL |
| 13 | **Tauri auto-updater** | Sparkle (macOS) | M (2-3d) | `@tauri-apps/plugin-updater` — check/download/install updates |
| 14 | **Windows code signing** | — | M (2d) | EV certificate for MSI/NSIS, SmartScreen trust |
| 15 | **Export MQL** | `MQLExportPlugin/` | S-M (1-2d) | MongoDB query language export |
| 16 | **Startup commands** | Advanced conn tab | S (1d) | Run SQL after connection established |

#### P3 — Nice to have / Deferred features

| # | Feature | Complexity | Notes |
|---|---------|------------|-------|
| 17 | **AI Chat panel** | XL (3-4w) | Full AI chat with OpenAI/Anthropic/Gemini/Ollama support |
| 18 | **AI inline suggestions** | XL (2-3w) | Ghost text SQL suggestions, requires AI provider integration |
| 19 | **AI provider config** | L (1w) | Settings UI for API keys, model selection |
| 20 | **AI schema context** | M (3-5d) | Build schema summary for AI context window |
| 21 | **Oracle driver** | XL (2-3w) | OCI-based, complex auth/TNS |
| 22 | **ClickHouse driver** | L (1-2w) | HTTP protocol, query progress |
| 23 | **DuckDB driver** | M (1w) | File-based, CSV/Parquet support |
| 24 | **Redshift driver** | S (2-3d) | PostgreSQL wire protocol variant |
| 25 | **SSH Agent auth (1Password etc.)** | M (3-5d) | Requires ssh-agent protocol on Windows |
| 26 | **SSH multi-hop (ProxyJump)** | L (1-2w) | Chain SSH connections |
| 27 | **SSH config parser** | M (3-5d) | Parse `~/.ssh/config` |
| 28 | **Preview tabs (temp open)** | S (1-2d) | Single-click = preview, double-click = permanent |
| 29 | **Deep link URL scheme** | M (2-3d) | `tablepro://` protocol handler registration |
| 30 | **Plugin management UI** | M (2-3d) | View/enable/disable loaded DLL plugins |
| 31 | **Multi-window** | L (1-2w) | Multiple Tauri windows per connection |
| 32 | **File association (.sqlite)** | S (1d) | Windows registry file type association |

---

## Updated Parity Score

| Category | Done | Partial | Missing | Total |
|----------|------|---------|---------|-------|
| Drivers | 4 | 0 | 6 | 10 |
| Connection Mgmt | 8 | 0 | 4 | 12 |
| Query Execution | 5 | 0 | 2 | 7 |
| Data Grid | 9 | 0 | 2 | 11 |
| SQL Editor | 6 | 0 | 1 | 7 |
| Side Panels | 9 | 0 | 2 | 11 |
| Export/Import | 6 | 0 | 2 | 8 |
| Structure View | 4 | 0 | 1 | 5 |
| Settings | 6 | 0 | 1 | 7 |
| Storage/Security | 6 | 0 | 0 | 6 |
| AI Features | 0 | 0 | 4 | 4 |
| SSH/Network | 3 | 0 | 2 | 5 |
| Shortcuts | 13 | 0 | 0 | 13 |
| UI/UX | 4 | 0 | 3 | 7 |
| CI/Packaging | 3 | 0 | 1 | 4 |
| **TOTAL** | **86** | **0** | **31** | **117** |

**Updated parity: ~74% Done, ~26% Missing** (up from ~55%)

---

## Recommended Next Steps

### Option A: Ship v1.0 Windows NOW (P2 features as v1.1)

Ship with current feature set — 4 drivers, SSH, import/export, filter, history, CRUD, tab persist. All core daily-use DB-client features present. Defer MongoDB, Redis, AI, advanced drivers to future releases.

**Pros:** Fast to market, core product solid, optimize & harden done
**Cons:** Missing 6 drivers limits market; no AI differentiator

### Option B: P2 Sprint — Close Quick Wins Before v1.0

Implement the 8 **small** P2 items (connection URL import, tags, color picker, copy as SQL, approx row count, quick search bar, filter presets, auto-updater) before v1.0. ~2-3 weeks.

**Pros:** Polished UX, auto-updater critical for distribution
**Cons:** Delays release, doesn't address driver gap

### Option C: Driver Expansion + Quick Wins → v1.0

Add 2-3 more drivers (DuckDB + Redshift; skip MongoDB/Redis for v1 since they need fundamentally different UI), plus Option B quick wins. ~4-6 weeks.

**Pros:** 6-7 drivers covers most SQL use cases, DuckDB is trending
**Cons:** Oracle/ClickHouse complex; MongoDB/Redis need custom grid

> [!IMPORTANT]
> **Auto-updater (Tauri updater plugin) is the single highest-impact missing feature for distribution.** Without it, users must manually download updates. Recommend prioritizing regardless of which option chosen.

---

## Unresolved Questions

1. Which option (A/B/C) does the team prefer for v1.0 scope?
2. Is AI (chat + inline) in scope for v1.0 or deferred to v1.1?
3. MongoDB/Redis — are these v1.0 requirements or can they be v1.1?
4. Windows code signing — does the team have an EV certificate purchased?
5. Should the parity checklist in `plans/260314-feature-parity-audit/parity-checklist.md` be updated in-place or archived with a new version?
