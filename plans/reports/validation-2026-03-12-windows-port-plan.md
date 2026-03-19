# Plan Validation Report: TablePro Windows Port

**Date:** 2026-03-12
**Validator:** Automated cross-check against macOS codebase (303 Swift files)
**Plan reviewed:** `plans/260312-1226-windows-port-implementation/`

---

## Verdict: CONDITIONALLY VIABLE — 7 issues must be addressed

The plan is well-structured, has correct architectural direction, and the phase ordering is sound. However, cross-referencing against the actual codebase reveals gaps and timeline risks.

---

## ✅ What the plan gets RIGHT

| Area | Assessment |
|------|-----------|
| Architecture choice (Tauri v2 + Rust + CM6) | Correct for constraints. Best velocity path. |
| Plugin FFI design (`PluginVTable` + C ABI) | Sound. Maps cleanly to macOS `PluginDatabaseDriver` protocol. |
| Editor stack (CodeMirror 6 + vim extension) | Good fit. CM6 covers multi-cursor, autocomplete, vim natively. |
| Storage mapping (DPAPI, SQLite, JSON) | Correct 1:1 mapping of macOS persistence. |
| Benchmark gates | Specific, measurable, time-bound. Good kill-switch criteria. |
| YAGNI list | Aggressive and appropriate for v1 scope. |
| Risk register | Covers real risks (WebView2, FFI ABI, tiberius, timeline). |
| Phase overlap strategy | Phases 2+3 parallel, 4+5 parallel — correct dependency ordering. |

---

## ❌ Issues Found

### ISSUE 1: Driver protocol surface area is UNDERESTIMATED (Severity: HIGH)

**Plan assumes:** ~15 FFI functions in `PluginVTable`
**Reality:** `DatabaseDriver` protocol has **33+ methods/properties**, `PluginDatabaseDriver` has **36+ methods**.

Missing from `PluginVTable`:
- `fetchAllColumns()` — bulk column fetch (avoids N+1)
- `fetchAllForeignKeys()` — bulk FK fetch
- `fetchAllDatabaseMetadata()` — bulk DB metadata
- `fetchApproximateRowCount()` — fast row count from metadata
- `fetchDependentTypes()` — PostgreSQL enum types for DDL
- `fetchDependentSequences()` — PostgreSQL sequences for DDL
- `fetchViewDefinition()` — view DDL
- `fetchTableMetadata()` — table size, engine, comment
- `fetchDatabaseMetadata()` — per-DB metadata
- `createDatabase()` — database creation
- `executeParameterized()` — parameterized queries
- `switchDatabase()` — SQL Server USE, ClickHouse switch
- `switchSchema()` — PostgreSQL search_path
- `applyQueryTimeout()` — per-session timeout
- `testConnection()` — connect-then-disconnect
- `buildBrowseQuery()` / `buildFilteredQuery()` / `buildQuickSearchQuery()` / `buildCombinedQuery()` — NoSQL query builders
- `generateStatements()` — NoSQL statement generation
- Capability flags: `supportsSchemas`, `supportsTransactions`

**Impact:** Phase 2 will take longer than 4 weeks if all these are implemented. The FFI boundary design needs ~30 function pointers, not 15.

**Fix:** Expand `PluginVTable` to match full protocol. Group optional methods behind capability flags. Budget +1 week for Phase 2.

---

### ISSUE 2: SchemaTracking subsystem is COMPLETELY MISSING from plan (Severity: MEDIUM)

**Reality:** macOS has `Core/SchemaTracking/` with 3 files:
- `StructureChangeManager.swift` — tracks column add/modify/drop before applying
- `SchemaStatementGenerator.swift` — generates ALTER TABLE SQL
- `StructureUndoManager.swift` — undo/redo for structure changes

Phase 5 mentions "Schema editing generates correct ALTER SQL" but doesn't account for the undo/redo layer or the change tracking model for structure changes.

**Fix:** Add explicit task in Phase 5 Week 1: port `StructureChangeManager` + `SchemaStatementGenerator` + `StructureUndoManager` to Rust.

---

### ISSUE 3: ForeignKey navigation is NOT mentioned (Severity: MEDIUM)

**Reality:** macOS has `MainContentCoordinator+FKNavigation.swift` — click a foreign key value → navigate to referenced row in referenced table.

This is a key user-facing feature not mentioned anywhere in Phase 4 or Phase 5.

**Fix:** Add to Phase 5 checklist: "FK navigation: click FK value → navigate to referenced table/row."

---

### ISSUE 4: Timeline is OPTIMISTIC for "full user-visible parity" (Severity: HIGH)

**Evidence:**
- 303 Swift source files in the macOS app
- 22 coordinator extension files (each = distinct feature area)
- Phase 5 "remaining features" is budgeted at 3 weeks to cover: export (4 formats), schema editing with undo, settings (8 panels), query history, quick switcher, connection groups/tags, safe mode, multi-window, tab persistence, licensing, health monitor, auto-reconnect, FK navigation, keyboard shortcut customization, dark/light/system theme
- That's ~25+ distinct features in 3 weeks for 2-3 devs

**Realistic estimate:** Phase 5 needs 4-5 weeks, not 3. Total plan should budget 20-24 weeks, not 18-22.

**Fix:** Either extend Phase 5 to 5 weeks or move lower-priority features (keyboard shortcut customization, connection color tags, multi-window) to v1.1 YAGNI list.

---

### ISSUE 5: NoSQL query builders are out of scope but plan doesn't SAY that clearly (Severity: LOW)

**Reality:** macOS has `buildBrowseQuery`, `buildFilteredQuery`, `buildQuickSearchQuery`, `buildCombinedQuery`, `generateStatements` on the driver protocol — used by MongoDB and Redis plugins.

**Plan's YAGNI list** correctly excludes MongoDB/Redis/ClickHouse drivers, but doesn't mention that the NoSQL query building methods on the FFI boundary can be skipped for v1.

**Fix:** Explicitly note in Phase 2: "NoSQL query builder methods (`buildBrowseQuery`, `buildFilteredQuery`, `buildQuickSearchQuery`, `buildCombinedQuery`, `generateStatements`) are NOT implemented in v1 plugin SDK. These are MongoDB/Redis-only and will be added when those drivers ship."

---

### ISSUE 6: `PluginDriverAdapter` complexity is underestimated (Severity: MEDIUM)

**Reality:** macOS `PluginDriverAdapter.swift` bridges `PluginDatabaseDriver` → `DatabaseDriver`. It handles:
- Schema parameter forwarding (some drivers have schema, some don't)
- NoSQL driver access (`noSqlPluginDriver` property)
- SSL config field mapping (varies per DB type: MongoDB uses `sslCACertPath`, Redis uses `redisDatabase`)
- Pgpass integration
- Driver variant selection

The plan's `adapter.rs` mentions FFI → trait adaptation but doesn't account for the per-database-type field mapping logic that lives in `DatabaseDriverFactory.buildAdditionalFields()`.

**Fix:** Add explicit task in Phase 2 Week 1: "Port `DatabaseDriverFactory.buildAdditionalFields` logic — SSL field mapping, driver variant selection, per-DB-type config fields."

---

### ISSUE 7: SSH tunnel explicitly deferred but plan.md says "full user-visible parity" (Severity: MEDIUM)

**Reality:** SSH tunneling is a heavily-used feature (2 files in `Core/SSH/`, documented extensively in docs). The plan correctly defers it to v1.1 in the YAGNI list, but `plan.md` line 22 says:

> Feature Scope: Full user-visible parity with macOS v0.17

This is contradictory. SSH tunnel, AI features, 5 drivers, import, localization, deep links are all deferred.

**Fix:** Change line 22 to: `Feature Scope: Core feature parity (see YAGNI list for explicit exclusions)`. Update any marketing/user-facing claims accordingly.

---

## ⚠️ Minor observations (non-blocking)

| # | Observation |
|---|------------|
| M1 | `ProgressUpdateCoalescer.swift` exists in Export — plan should coalesce progress events over IPC too (Tauri events are async, don't spam at 60fps) |
| M2 | `SSHConfigParser.swift` parses `~/.ssh/config` — not relevant for Windows but worth noting for future cross-platform |
| M3 | macOS `AnalyticsService` exists — plan doesn't mention telemetry. Good for enterprise (no telemetry), but document the decision |
| M4 | `AIEditorContextMenu.swift` exists — confirms AI is deeper than just chat; it's in editor context menu too. Correctly deferred. |
| M5 | `OnboardingContentView.swift` exists — plan doesn't mention first-run experience. Consider adding a simple welcome/onboarding flow |
| M6 | `FuzzyMatcher.swift` used in Quick Switcher — use a JS fuzzy matching lib (e.g., `fzf-for-js` or `fuse.js`) rather than porting |
| M7 | Phase 1 references "existing `tablepro-windows/` skeleton with Monaco" — verify this actually exists in the repo before assuming it |

---

## Corrected Timeline Estimate

| Phase | Plan says | Validated estimate | Delta |
|-------|-----------|-------------------|-------|
| 1: Foundation | 3 wk | 3 wk | ±0 |
| 2: Rust Core + Plugins | 4 wk | 5 wk (+1 for full protocol surface) | +1 wk |
| 3: SQL Editor | 3 wk | 3 wk | ±0 |
| 4: Data Grid + CRUD | 3 wk | 3-4 wk | +0.5 wk |
| 5: Feature Parity | 3 wk | 5 wk (25+ features) | +2 wk |
| 6: Packaging + QA | 2-4 wk | 3-4 wk | ±0 |
| **Total** | **18-22 wk** | **22-26 wk** | **+4 wk** |

With 3 devs and aggressive scope management: **20-22 weeks realistic**.
With 2 devs: **24-26 weeks realistic**.

---

## Recommendations

1. **Expand Phase 2 plugin SDK** to cover full `PluginDatabaseDriver` protocol (36 methods). Budget 5 weeks.
2. **Move 5 features to v1.1** to keep timeline: connection color tags, keyboard shortcut customization, multi-window, onboarding flow, connection import/export.
3. **Fix "full parity" claim** — change to "core feature parity" with explicit exclusion list.
4. **Add FK navigation** to Phase 5 checklist.
5. **Add SchemaTracking port** (StructureChangeManager + undo) to Phase 5.
6. **Add progress coalescing** note to Phase 5 export implementation.
7. **Verify `tablepro-windows/` skeleton** exists before Phase 1 starts.
