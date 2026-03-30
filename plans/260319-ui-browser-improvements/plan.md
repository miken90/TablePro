# Plan: UI Browser Improvements

**Status:** Completed  
**Created:** 2026-03-19  
**Plan dir:** `plans/260319-ui-browser-improvements/`

## Overview

Two targeted UI fixes for the TablePro Windows database browser:

1. **Pagination — First/Last buttons + row range display** (`grid/pagination.tsx`)
2. **History — Copy-to-clipboard per entry** (`history/HistoryPanel.tsx`)

Everything else from the spec (table-click records, SQL editor split layout, inline editing) is **already implemented** and needs no changes.

## Scope

| Feature | Status | Action |
|---------|--------|--------|
| Table click → show records | ✅ Done | None |
| SQL Editor tab split layout | ✅ Done | None |
| Inline cell editing | ✅ Done | None |
| Pagination First/Last + range | ✅ Done | Phase 1 |
| History copy SQL | ✅ Done | Phase 2 |

## Phases

| Phase | File | Effort | Status |
|-------|------|--------|--------|
| [Phase 1](./phase-01-pagination.md) | `grid/pagination.tsx` | 30 min | ✅ Done |
| [Phase 2](./phase-02-history-copy.md) | `history/HistoryPanel.tsx` | 30 min | ✅ Done |

## Notes

- `shared/Pagination.tsx` is **unused** (no imports found) → delete it
- Copy feedback pattern: `useState<boolean>(copied)` + icon swap (Check ↔ Clipboard) + 2s timeout — identical to `ddl-tab.tsx`
- No new dependencies needed; `ChevronsLeft`/`ChevronsRight` already in lucide-react (same bundle)
