---
phase: 4
features: [quick-search-bar, filter-presets]
effort: 2-3d
risk: LOW
---

# Phase 4: Filter & Search Improvements

## Context

- Plan: [plan.md](./plan.md)
- Existing: `components/filter/filter-panel.tsx` — full WHERE builder with AND/OR logic
- Existing: `stores/filterStore.ts` (or similar) — filter state management

## Overview

Two enhancements to existing filter infrastructure: (1) simplified quick search bar for fast text filtering, (2) save/load filter presets for reuse.

---

## Feature 4A: Quick Search Bar

**What:** A single text input bar above the data grid. Type any text → generates `col1 LIKE '%term%' OR col2 LIKE '%term%' OR ...` across all string columns. Simpler than the full filter panel.

### Implementation

#### [NEW] `src/components/filter/quick-search-bar.tsx`
- Single text input with search icon + clear button
- On input change (debounced 300ms): build WHERE clause
- For each text/varchar column: `col LIKE '%search_term%'`
- Join with OR
- Send to existing `fetch_rows` with `where_clause` param
- Esc key clears search

#### [MODIFY] `src/components/grid/result-toolbar.tsx`
- Mount `QuickSearchBar` in toolbar area (next to filter toggle button)
- Visible when in table browse mode (not raw SQL query mode)

> [!IMPORTANT]
> `filterStore.ts` does NOT exist. Filter state is currently local `useState` inside `filter-panel.tsx` (102L). Must create store.

#### [NEW] `src/stores/filterStore.ts`
- Create Zustand store keyed by tab ID: `{ [tabId]: { conditions, logic, quickSearchTerm } }`
- Migrate existing `useState` from `filter-panel.tsx` to use this store
- Add `quickSearchTerm: string` per tab
- Combine quick search WHERE with filter panel WHERE (AND logic)
- Persist state so tab switches don't lose filters

### Tests
- Manual: browse table → type in search bar → verify grid filters and shows matching rows
- Manual: clear search → all rows return

---

## Feature 4B: Filter Presets

**What:** Save current filter configuration as a named preset. Load/delete presets from dropdown.

### Implementation

#### [NEW] `src-tauri/src/storage/filter_store.rs`
- `FilterPreset { id, name, table_name, conditions: Vec<FilterCondition>, logic: String }`
- Storage: `%APPDATA%/TablePro/filter-presets.json`
- CRUD operations: `save_filter_preset`, `load_filter_presets`, `delete_filter_preset`
- Load presets filtered by table name (each preset tied to a specific table)

#### [NEW] `src-tauri/src/commands/filter.rs`
- 3 Tauri commands: `save_filter_preset`, `load_filter_presets`, `delete_filter_preset`

#### [MODIFY] `src-tauri/src/lib.rs`
- Register new filter commands

#### [MODIFY] `src/components/filter/filter-panel.tsx`
- Add "Save Preset" button → name input dialog → save current filters
- Add preset dropdown → select → load filters into panel
- Add delete option per preset
- Show presets relevant to current table only

#### [NEW] `src/ipc/filter-commands.ts`
- IPC wrappers: `saveFilterPreset()`, `loadFilterPresets()`, `deleteFilterPreset()`

### Tests
- Manual: set up filter → save as "Active Users" → clear filter → load preset → verify filters restored
- Manual: delete preset → verify removed from dropdown
- Rust test: serde round-trip for FilterPreset

---

## File Ownership

| Feature | Rust files | Frontend files |
|---------|-----------|----------------|
| 4A Quick Search | — | `quick-search-bar.tsx` (new), `result-toolbar.tsx` |
| 4B Presets | `storage/filter_store.rs` (new), `commands/filter.rs` (new), `lib.rs` | `filter-panel.tsx`, `filter-commands.ts` (new) |

**No conflicts** between 4A and 4B — can parallel.

## Todo

- [x] Create quick search bar component
- [x] Mount in result toolbar
- [x] Build WHERE clause from search term across string columns
- [x] Debounce search input
- [x] Create filter preset storage (Rust)
- [x] Create filter preset commands (Rust)
- [x] Register commands in lib.rs
- [x] Add save/load/delete preset UI to filter panel
- [x] IPC wrappers for filter commands
- [ ] Tests: preset serde, manual search + preset workflow

## Success Criteria

- [ ] Type text in search bar → grid filters matching rows across all text columns
- [ ] Clear search → all rows return
- [ ] Save filter preset → appears in presets dropdown
- [ ] Load preset → filter panel populated with saved conditions
- [ ] Delete preset → removed from dropdown
- [ ] Presets scoped to table (table A presets don't show in table B)
