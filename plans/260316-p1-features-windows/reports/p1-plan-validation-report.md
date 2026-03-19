# P1 Plan Validation Report

> Date: 2026-03-16
> Validator: Plan cross-referenced against codebase files

## Summary

**Verdict: PLAN IS SOUND — 4 issues to fix before implementation, 2 warnings.**

The plan is well-structured, phases are correctly sequenced, file ownership avoids conflicts, and architecture decisions are validated against the codebase. Below are specific findings.

---

## Issues (Must Fix)

### 1. Shortcut Conflict: `Ctrl+Shift+E` bound twice

**Location:** `plan.md` keyboard shortcuts reference table (lines 189, 199)
- Navigation section: `Ctrl+Shift+E` → Toggle sidebar
- General section: `Ctrl+Shift+E` → Export

**Current code:** `useKeyboardShortcuts.ts` line 102-106 binds `Ctrl+Shift+E` to toggle sidebar only. Export is triggered via toolbar button, not a shortcut.

**Recommendation:** Remove `Ctrl+Shift+E` from the Export row in the shortcuts table. Export doesn't need a dedicated shortcut — it's accessible via toolbar. If one is desired, use `Ctrl+Shift+X` (eXport).

### 2. Missing `Ctrl+Shift+F` for Filter Panel in shortcuts hook

**Location:** `plan.md` line 191 lists `Ctrl+Shift+F` → Toggle filter panel
**Current code:** `useKeyboardShortcuts.ts` binds `Ctrl+Shift+F` to Format SQL (line 80-83). There is NO filter panel toggle shortcut.

**Conflict:** `Ctrl+Shift+F` is claimed by both "Format SQL" (Editor section, line 166) and "Toggle filter panel" (Navigation section, line 191).

**Recommendation:** Remove "Toggle filter panel" from the `Ctrl+Shift+F` binding. Format SQL is already implemented and takes precedence. Filter panel can use `Ctrl+Shift+P` or remain toolbar-only.

### 3. Missing `Ctrl+H` for History Panel in shortcuts hook

**Location:** `plan.md` line 192 lists `Ctrl+H` → Toggle history panel
**Current code:** `useKeyboardShortcuts.ts` has NO `Ctrl+H` handler.

**Impact:** Phase 1 plan (`phase-01-quick-wins.md`) doesn't mention adding `Ctrl+H`. It will be missing from the help dialog unless added.

**Recommendation:** Add `Ctrl+H` handler to Phase 1 scope (it's a 2-line addition). Or remove from the shortcuts reference if history toggle should remain toolbar-only.

### 4. `Ctrl+Shift+I` for Inspector toggle not in shortcuts hook

**Location:** `plan.md` line 190 lists `Ctrl+Shift+I` → Toggle inspector
**Current code:** `useKeyboardShortcuts.ts` has NO `Ctrl+Shift+I` handler.

**Impact:** Same as #3 — listed in plan's shortcuts reference but not implemented and not in Phase 1 scope.

**Recommendation:** Add to Phase 1 scope (2-line addition) or remove from shortcuts reference.

---

## Warnings (Non-blocking)

### W1. Export command uses subquery wrapping — may fail on some SQL

**File:** `export.rs` line 98 — `SELECT COUNT(*) FROM ({sql}) AS _export_count`
**Impact on XLSX:** The XLSX export will inherit this pattern. Works for simple SELECT but fails if `sql` contains CTEs, UNION, or database-specific syntax.
**Risk:** LOW — existing behavior, not a P1 regression.

### W2. Phase 3 `fetch_schemas` command adds to lib.rs handler list

**File:** `lib.rs` line 64-100 — handler registration already has 19 commands.
**Impact:** Phase 3 adds `fetch_schemas`, Phase 4 adds `import_preview` + `import_sql_file`, Phase 5 modifies `connect`/`disconnect`. Total will reach ~22+ commands.
**Risk:** LOW — no technical limit, just monitor for maintainability.

---

## Validated (Confirmed Correct)

| Claim in Plan | Validated Against | Result |
|---|---|---|
| `Ctrl+W` already implemented | `useKeyboardShortcuts.ts:64-71` | ✅ Confirmed |
| Export handles csv/json/sql with chunking | `export.rs:149-231` | ✅ Confirmed |
| ConnectionConfig has 7 fields | `connection.rs:6-14` | ✅ Confirmed |
| SavedConnection has id+name+config | `connection.rs:27-31` | ✅ Confirmed, no `group_id` yet |
| `safeMode: boolean` in settings | `settings.ts:9` | ✅ Confirmed |
| `schema` param in fetch_columns/indexes/fks | `schema.rs:24,38,52` | ✅ Confirmed (Option<String>) |
| No `fetch_schemas` command exists | `schema.rs` + `lib.rs` | ✅ Confirmed |
| `tauri-plugin-dialog` available | `Cargo.toml:33`, `lib.rs:51` | ✅ Confirmed |
| `rusqlite` bundled dependency | `Cargo.toml:34` | ✅ Confirmed |
| No SSH fields in ConnectionConfig | `connection.rs:6-14` | ✅ Confirmed |
| Plugin VTable has no `fetch_schemas` | Previous read of vtable.rs | ✅ Confirmed |
| `fetch_tables` doesn't accept schema param | `schema.rs:9-17` | ✅ Confirmed — takes only session_id |

---

## File Ownership Validation

No conflicts detected between phases:
- Phase 1 agents touch: `export.rs` (XLSX), `useKeyboardShortcuts.ts` + `ShortcutsHelp.tsx` (shortcuts)
- Phase 2 agents touch: `connection.rs` models + `connection_store.rs` (groups), `settingsStore.ts` + `settings.ts` (safe mode)
- Phase 3 agents touch: `schema.rs` commands + `schemaStore.ts` (schema), `grid/` components (FK)
- Phase 4 agent: `import.rs` + `import_service.rs` (new files)
- Phase 5 agent: `ssh_tunnel.rs` (new) + `connection_manager.rs` + `ConnectionForm.tsx`

**One overlap:** Phase 2 (groups) and Phase 5 (SSH) both modify `models/connection.rs`. Safe because they run in different phases (sequential).

**One overlap within Phase 1:** P1-6 shortcuts + P1-9 tab mgmt both touch `useKeyboardShortcuts.ts`. Plan already notes this and combines them into a single task. ✅

---

## Dependency Chain Validation

```
Phase 0 (SSH spike) → blocks Phase 5 only
Phase 1 (XLSX, shortcuts, tabs) → no deps ✅
Phase 2 (groups, safe mode) → no deps ✅
Phase 3 (schema, FK nav) → no deps ✅
Phase 4 (import) → no deps ✅
Phase 5 (SSH) → depends on Phase 0 ✅
```

Phases 1-4 can run in any order or parallel. Phase 5 must wait for Phase 0 go/no-go. ✅

---

## Recommendations

1. **Fix shortcuts conflicts** (#1-#4 above) in `plan.md` before implementation
2. **Start with Phase 0** (SSH spike) — 1 day, unblocks Phase 5 planning
3. **Phase 1 is the best first implementation phase** — low risk, high visibility, quick wins
4. **Consider doing Phases 1+2 in parallel** if 2+ agents available (no file conflicts)
