# Phase 2 — History Panel: Copy SQL to Clipboard

## Context

- **File to modify:** `tablepro-windows/src/components/history/HistoryPanel.tsx`
- **Pattern reference:** `tablepro-windows/src/components/structure/ddl-tab.tsx` (same `copied` state + icon swap pattern)

## Current State

`HistoryPanel.tsx` per entry has:
- ✅ Click row → `onSelectQuery(entry.query)` (load into editor)
- ✅ Hover → delete (X) button
- ❌ Missing: copy-to-clipboard button
- ❌ Missing: clipboard feedback

## Requirements

1. Add a **Copy** (`Clipboard` icon) button per history entry, visible on hover alongside the delete button.
2. Clicking Copy → `navigator.clipboard.writeText(entry.query)`.
3. On success: icon swaps to `Check` (green) for 2 seconds, then reverts — exactly like `ddl-tab.tsx`.
4. On failure (clipboard permission denied): silently fail (no crash; optional console.warn).
5. Existing click-to-load behavior **unchanged**.
6. Button order in the actions group: **[Copy] [Delete]**.

## Implementation

### Step 1 — Update imports

```diff
-import { Search, Trash2, X, Clock, Database } from "lucide-react";
+import { Search, Trash2, X, Clock, Database, Clipboard, Check } from "lucide-react";
```

### Step 2 — Add per-entry copy state

Track which entry id was just copied (avoids N individual `useState` booleans):

```ts
const [copiedId, setCopiedId] = useState<number | null>(null);
```

### Step 3 — Add `handleCopy` callback

```ts
const handleCopy = useCallback(
  (e: React.MouseEvent, id: number, query: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(query).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    }).catch(() => { /* clipboard permission denied — no-op */ });
  },
  [],
);
```

### Step 4 — Replace action buttons in the entry JSX

Current:
```tsx
<button
  onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
  className="hidden rounded p-0.5 text-zinc-400 transition hover:text-red-500 group-hover:block ..."
>
  <X size={10} />
</button>
```

Replace with:
```tsx
<div className="hidden items-center gap-0.5 group-hover:flex">
  {/* Copy button */}
  <button
    onClick={(e) => handleCopy(e, entry.id, entry.query)}
    className="rounded p-0.5 text-zinc-400 transition hover:text-blue-500 dark:text-zinc-600 dark:hover:text-blue-400"
    title="Copy query"
  >
    {copiedId === entry.id
      ? <Check size={10} className="text-green-500" />
      : <Clipboard size={10} />}
  </button>
  {/* Delete button */}
  <button
    onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
    className="rounded p-0.5 text-zinc-400 transition hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400"
    title="Delete entry"
  >
    <X size={10} />
  </button>
</div>
```

**Note:** The wrapping `<div>` uses `hidden group-hover:flex` so both buttons appear together on hover — avoids layout shift.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Clipboard API unavailable (non-HTTPS / old browser) | `.catch()` silences error, no UI change |
| User hovers away before 2s timeout | `copiedId` resets to null normally |
| User copies two entries quickly | Second copy resets the first (timeout guard in `setCopiedId` callback) |
| Very long query (multi-KB) | `writeText` handles arbitrary length; no truncation |

## Acceptance Criteria

- [ ] Hovering a history entry reveals **both** Copy and Delete buttons
- [ ] Clicking Copy writes the **full** (untruncated) `entry.query` to clipboard
- [ ] Copy icon becomes a green checkmark for ~2 seconds then reverts
- [ ] Existing "click entry to load into editor" still works
- [ ] Delete still works and does not trigger copy
- [ ] No console errors under normal usage

## Files Changed

| File | Change |
|------|--------|
| `tablepro-windows/src/components/history/HistoryPanel.tsx` | Modify |
