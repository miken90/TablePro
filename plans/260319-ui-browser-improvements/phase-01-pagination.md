# Phase 1 — Pagination: First/Last Buttons + Row Range

## Context

- **File to modify:** `tablepro-windows/src/components/grid/pagination.tsx`
- **File to delete:** `tablepro-windows/src/components/shared/Pagination.tsx` (unused — no imports)
- **Consumer:** `tablepro-windows/src/components/grid/result-panel.tsx` line 491

## Current State

`grid/pagination.tsx` has:
- ✅ Rows-per-page dropdown (50, 100, 500, 1000, 5000)
- ✅ "Page X of Y" text
- ✅ Prev (`ChevronLeft`) / Next (`ChevronRight`) buttons
- ✅ `isLoading` disables all controls
- ❌ Missing: **First** (`ChevronsLeft`) and **Last** (`ChevronsRight`) buttons
- ❌ Missing: **Row range display** ("X–Y of Z rows" format)

`shared/Pagination.tsx` has range display and different page size options but is **never imported** anywhere → delete it.

## Requirements

1. Add **First** button: jumps to page 1; disabled when `page === 1` or `isLoading`.
2. Add **Last** button: jumps to `totalPages`; disabled when `page === totalPages` or `isLoading`.
3. Change row count text from `"{total} rows"` to `"{start}–{end} of {total} rows"` (or `"0 rows"` when total = 0).
4. Button order: `|< < [page text] > >|`
5. Page size options stay: `[50, 100, 500, 1000, 5000]`

## Implementation

### Step 1 — Update imports in `grid/pagination.tsx`

```diff
-import { ChevronLeft, ChevronRight } from 'lucide-react';
+import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
```

### Step 2 — Add derived values

```ts
const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
const end = Math.min(page * pageSize, total);
```

### Step 3 — Replace row count span

```diff
-<span className="text-zinc-500 dark:text-zinc-400">
-  {total.toLocaleString()} rows
-</span>
+<span className="text-zinc-500 dark:text-zinc-400">
+  {total > 0 ? `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} rows` : '0 rows'}
+</span>
```

### Step 4 — Add First/Last buttons flanking Prev/Next

```diff
+<button
+  type="button"
+  disabled={!canPrev || isLoading}
+  onClick={() => onPageChange(1)}
+  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
+  title="First page"
+>
+  <ChevronsLeft size={14} />
+</button>
 <button
   type="button"
   disabled={!canPrev || isLoading}
   onClick={() => onPageChange(page - 1)}
   ...
 >
   <ChevronLeft size={14} />
 </button>
 <span ...>Page {page} of {totalPages}</span>
 <button
   type="button"
   disabled={!canNext || isLoading}
   onClick={() => onPageChange(page + 1)}
   ...
 >
   <ChevronRight size={14} />
 </button>
+<button
+  type="button"
+  disabled={!canNext || isLoading}
+  onClick={() => onPageChange(totalPages)}
+  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40"
+  title="Last page"
+>
+  <ChevronsRight size={14} />
+</button>
```

### Step 5 — Delete unused file

```bash
rm tablepro-windows/src/components/shared/Pagination.tsx
```

## Final Shape of `grid/pagination.tsx`

```
[X–Y of Z rows]     [flex-1 spacer]     [Rows per page: ▾]   [Page M of N]   [|< < > >|]
```

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Empty table (total=0) | "0 rows", all nav buttons disabled |
| Single page (totalPages=1) | First/Prev/Next/Last all disabled |
| Last page (partial rows) | Correct "end" capped at total |
| isLoading=true | All buttons + select disabled |

## Acceptance Criteria

- [ ] `|<` (First) button appears; clicks go to page 1
- [ ] `>|` (Last) button appears; clicks go to last page
- [ ] Row range reads "X–Y of Z rows", not just "Z rows"
- [ ] Empty: shows "0 rows"; all nav buttons disabled
- [ ] Single page: all nav buttons disabled
- [ ] `shared/Pagination.tsx` deleted (no references to update)
- [ ] `cargo clippy` / `npx eslint .` passes

## Files Changed

| File | Change |
|------|--------|
| `tablepro-windows/src/components/grid/pagination.tsx` | Modify |
| `tablepro-windows/src/components/shared/Pagination.tsx` | Delete |
