# Phase 1 — Quick Wins: XLSX Export, Keyboard Shortcuts + Help, Tab Management

> Est. effort: 3-4 days (3 parallel agents)
> Dependencies: None

---

## P1-3: XLSX Export

### Overview
Add `.xlsx` format to existing export dialog. Rust-side uses `rust_xlsxwriter` crate.

### Implementation

**Rust (`commands/export.rs`):**
1. Add `rust_xlsxwriter` to host `Cargo.toml`
2. In `export_to_file` match arm for format `"xlsx"`:
   - Create `Workbook::new()`
   - Add worksheet, write header row from column names
   - Stream rows: write each cell with type-aware formatting (number, text, date)
   - Close workbook → writes to file
3. Excel row limit: cap at 1,048,576 rows per sheet

**Edge cases:**
- Column names with special chars → xlsx handles natively
- NULL values → write empty cell
- Very long text → xlsx truncates at 32,767 chars per cell
- Date/timestamp → use `ExcelDateTime` format

**Cargo.toml addition:**
```toml
rust_xlsxwriter = "0.79"
```

### Files touched
- `src-tauri/Cargo.toml` — add dep
- `src-tauri/src/commands/export.rs` — add xlsx branch
- Frontend: no changes (export dialog already has format selector)

### Verification
- Export 1K row table → open in Excel/LibreOffice, verify data
- Export with NULLs, dates, JSON → correct types
- Export >1M rows → graceful cap or second sheet

---

## P1-6 + P1-9: Keyboard Shortcuts + Help Dialog + Tab Management

### Overview
Add missing shortcuts, add help overlay showing all shortcuts.

> **Note:** `Ctrl+W` (close tab) already implemented in P0. Not needed here.

### New Shortcuts

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Ctrl+I` | Insert new row | Grid must be focused/active |
| `Ctrl+Tab` | Next tab | Cycles forward through tabs |
| `Ctrl+Shift+Tab` | Previous tab | Cycles backward |
| `Ctrl+Shift+M` | Open Import SQL dialog | Avoids Ctrl+Shift+I conflict with Inspector |
| `Ctrl+Shift+I` | Toggle inspector | Pairs with existing Ctrl+Shift+E sidebar toggle |
| `Ctrl+H` | Toggle history panel | |
| `F1` or `Ctrl+?` | Keyboard shortcuts help | Opens overlay |

### Implementation

**`hooks/useKeyboardShortcuts.ts` additions:**
```typescript
// New handlers in ShortcutHandlers interface:
onInsertRow?: () => void;
onImportSql?: () => void;
onShowHelp?: () => void;
onToggleInspector?: () => void;
onToggleHistory?: () => void;

// Ctrl+I — insert row
if (ctrl && !e.shiftKey && e.key === "i") {
  e.preventDefault();
  handlers?.onInsertRow?.();
}

// Ctrl+Tab / Ctrl+Shift+Tab — switch tabs
if (e.ctrlKey && e.key === "Tab") {
  e.preventDefault();
  const idx = tabs.findIndex(t => t.id === activeTabId);
  if (e.shiftKey) {
    const prev = idx > 0 ? idx - 1 : tabs.length - 1;
    setActiveTab(tabs[prev].id);
  } else {
    const next = idx < tabs.length - 1 ? idx + 1 : 0;
    setActiveTab(tabs[next].id);
  }
}

// Ctrl+Shift+M — import SQL
if (ctrl && e.shiftKey && e.key === "M") {
  e.preventDefault();
  handlers?.onImportSql?.();
}

// Ctrl+Shift+I — toggle inspector
if (ctrl && e.shiftKey && e.key === "I") {
  e.preventDefault();
  handlers?.onToggleInspector?.();
}

// Ctrl+H — toggle history
if (ctrl && !e.shiftKey && e.key === "h") {
  e.preventDefault();
  handlers?.onToggleHistory?.();
}

// F1 — shortcuts help
if (e.key === "F1") {
  e.preventDefault();
  handlers?.onShowHelp?.();
}
```

### Help Dialog (`components/shared/ShortcutsHelp.tsx`)

New component showing all keyboard shortcuts in a modal overlay.

**UX:**
- Full-screen overlay with semi-transparent backdrop
- Grouped sections: Editor, Tabs, Data Grid, Navigation, General
- Each row: shortcut key (styled as `<kbd>` badges) + description
- Dismiss: Esc, click backdrop, or close button
- Searchable (optional, nice-to-have)

**Data source:** Static array of shortcut definitions:
```typescript
const SHORTCUTS = [
  { group: "Editor", shortcuts: [
    { keys: ["Ctrl", "Enter"], action: "Run query" },
    { keys: ["Ctrl", "Shift", "Enter"], action: "Run all statements" },
    { keys: ["Ctrl", "Shift", "F"], action: "Format SQL" },
    { keys: ["Ctrl", "/"], action: "Toggle comment" },
    { keys: ["Ctrl", "D"], action: "Select next occurrence" },
  ]},
  { group: "Tabs", shortcuts: [
    { keys: ["Ctrl", "N"], action: "New tab" },
    { keys: ["Ctrl", "W"], action: "Close tab" },
    { keys: ["Ctrl", "Tab"], action: "Next tab" },
    { keys: ["Ctrl", "Shift", "Tab"], action: "Previous tab" },
  ]},
  { group: "Data Grid", shortcuts: [
    { keys: ["Ctrl", "S"], action: "Save changes" },
    { keys: ["Ctrl", "I"], action: "Insert new row" },
    { keys: ["Ctrl", "Z"], action: "Undo" },
    { keys: ["Ctrl", "Shift", "Z"], action: "Redo" },
  ]},
  { group: "Navigation", shortcuts: [
    { keys: ["Ctrl", "K"], action: "Quick switcher" },
    { keys: ["Ctrl", "Shift", "E"], action: "Toggle sidebar" },
    { keys: ["Ctrl", "Shift", "I"], action: "Toggle inspector" },
    { keys: ["Ctrl", "H"], action: "Toggle history" },
  ]},
  { group: "General", shortcuts: [
    { keys: ["Ctrl", ","], action: "Settings" },
    { keys: ["Ctrl", "Shift", "M"], action: "Import SQL" },
    { keys: ["F5"], action: "Refresh schema" },
    { keys: ["F1"], action: "This help" },
    { keys: ["Escape"], action: "Cancel / dismiss" },
  ]},
];
```

### Handler wiring for Ctrl+I:
- `MainLayout.tsx` passes `onInsertRow` handler to keyboard shortcuts
- Handler calls `changeStore.addNewRow()` (existing method from P0 changeStore)
- Only active when viewing table data (not raw query result)

### Files touched
- `src/hooks/useKeyboardShortcuts.ts` — add shortcuts + handler interface
- `src/components/shared/ShortcutsHelp.tsx` (new) — help overlay
- `src/components/layout/MainLayout.tsx` — wire handlers, render help overlay

### Verification
- Ctrl+Tab cycles forward through tabs, wraps around
- Ctrl+Shift+Tab cycles backward
- Ctrl+I inserts empty row at bottom of grid (only when viewing table)
- F1 opens shortcuts help overlay
- Esc dismisses help overlay
- Ctrl+Shift+M does nothing yet (wired in Phase 4 Import SQL)
- Ctrl+Shift+I toggles inspector panel
- Ctrl+H toggles history panel
- All shortcuts listed in help dialog match actual behavior
