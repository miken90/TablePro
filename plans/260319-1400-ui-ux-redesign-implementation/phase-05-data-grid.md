# Phase 5: Data Grid Enhancements

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P1
- **Status:** Completed ✅
- **Effort:** 16h
- **Parallel:** No (depends on Phase 1)

Enhance data grid with better inline editing, NULL styling, type formatting, diff indicators, and column actions.

## Key Insights
- Virtualization already implemented (`@tanstack/react-virtual`)
- Row height: 28px constant
- Cell editing exists but basic
- No diff visualization for pending changes
- NULL displayed based on settings but not visually distinct

## Requirements

### Functional
- [ ] Distinct NULL styling (italic gray badge)
- [ ] Diff indicators: green (insert), yellow (update), red (delete)
- [ ] Column header menu (sort, filter, hide, copy name)
- [ ] Type-aware cell formatting (JSON, UUID, dates)
- [ ] Sticky first N columns (freeze panes)
- [ ] Bulk row selection with checkbox column
- [ ] Copy cell/row with smart formatting

### Non-Functional
- [ ] Maintain 60fps scrolling with 100K rows
- [ ] No layout shift during editing
- [ ] Design tokens from Phase 1

## Architecture

### Cell Formatting Strategy
```typescript
// utils/cell-formatter.ts
type CellType = 'text' | 'number' | 'boolean' | 'date' | 'json' | 'uuid' | 'null';

function detectCellType(value: string | null, columnType?: string): CellType {
  if (value === null) return 'null';
  if (columnType?.includes('json')) return 'json';
  if (UUID_REGEX.test(value)) return 'uuid';
  if (ISO_DATE_REGEX.test(value)) return 'date';
  // ...
}

function formatCell(value: string | null, type: CellType): React.ReactNode {
  switch (type) {
    case 'null': return <NullBadge />;
    case 'json': return <JsonCell value={value} />;
    case 'uuid': return <UuidCell value={value} />;
    // ...
  }
}
```

### Diff Indicator Colors
```css
/* Row gutter colors */
.row-inserted { border-left: 3px solid var(--color-accent-green); }
.row-modified { border-left: 3px solid var(--color-accent-yellow); }
.row-deleted { 
  border-left: 3px solid var(--color-accent-red);
  opacity: 0.6;
  text-decoration: line-through;
}
```

## Related Code Files

### Modify
- `tablepro-windows/src/components/grid/data-grid.tsx` — Main grid
- `tablepro-windows/src/components/grid/grid-row.tsx` — Row rendering
- `tablepro-windows/src/components/grid/grid-header.tsx` — Column headers
- `tablepro-windows/src/components/grid/cell-editor.tsx` — Inline editing

### Create
- `tablepro-windows/src/components/grid/cell-formatters/null-badge.tsx`
- `tablepro-windows/src/components/grid/cell-formatters/json-cell.tsx`
- `tablepro-windows/src/components/grid/cell-formatters/uuid-cell.tsx`
- `tablepro-windows/src/components/grid/cell-formatters/date-cell.tsx`
- `tablepro-windows/src/components/grid/column-menu.tsx`
- `tablepro-windows/src/utils/cell-formatter.ts`

## Implementation Steps

### Step 1: Create Cell Formatter Utilities (2h)
```typescript
// cell-formatter.ts
export function detectCellType(value: string | null, hint?: string): CellType { ... }
export function formatCellValue(value: string | null, type: CellType): string { ... }
```

### Step 2: Create NULL Badge Component (1h)
```tsx
// null-badge.tsx
export function NullBadge() {
  return (
    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium italic text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
      NULL
    </span>
  );
}
```

### Step 3: Create Type-Aware Cell Components (3h)
- `JsonCell`: Collapsed preview, click to expand in inspector
- `UuidCell`: Monospace, truncated with copy button
- `DateCell`: Formatted date with relative time tooltip
- `BooleanCell`: Checkbox-style indicator

### Step 4: Add Diff Indicators to GridRow (2h)
```tsx
// grid-row.tsx updates
const rowClass = cn(
  'flex border-b',
  changeType === 'inserted' && 'bg-green-500/10 border-l-2 border-l-green-500',
  changeType === 'modified' && 'bg-yellow-500/10 border-l-2 border-l-yellow-500',
  changeType === 'deleted' && 'bg-red-500/10 border-l-2 border-l-red-500 opacity-60 line-through',
);
```

### Step 5: Create Column Header Menu (3h)
```tsx
// column-menu.tsx
export function ColumnMenu({ column, onSort, onFilter, onHide, onCopyName }) {
  return (
    <DropdownMenu>
      <DropdownItem onClick={() => onSort('asc')}>Sort Ascending</DropdownItem>
      <DropdownItem onClick={() => onSort('desc')}>Sort Descending</DropdownItem>
      <Separator />
      <DropdownItem onClick={onFilter}>Filter by this column</DropdownItem>
      <DropdownItem onClick={onHide}>Hide Column</DropdownItem>
      <Separator />
      <DropdownItem onClick={onCopyName}>Copy Column Name</DropdownItem>
    </DropdownMenu>
  );
}
```

### Step 6: Add Checkbox Selection Column (2h)
- Add checkbox as first virtual column
- Wire to selectedRows state
- Support Shift+Click for range select

### Step 7: Implement Sticky Columns (2h)
- Add `stickyColumns` count to grid props
- Use `position: sticky` for first N columns
- Handle horizontal scroll offset

### Step 8: Polish & Integration (1h)
- Apply design tokens to all new components
- Ensure consistent spacing
- Test with large datasets

## Todo List
- [x] Create `cell-formatter.ts` utility
- [x] Create `NullBadge` component
- [x] Create `JsonCell` component
- [x] Create `UuidCell` component
- [x] Create `DateCell` component
- [x] Update `GridRow` with diff indicator styling
- [x] Create `ColumnMenu` dropdown component
- [x] Add column menu to `GridHeader`
- [x] Add checkbox column for row selection
- [x] Implement sticky columns with CSS
- [x] Wire cell formatters into grid rendering
- [x] Test with 100K+ row dataset
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] NULL values display as styled badge
- [x] Diff indicators visible for all change types
- [x] Column header menu functional
- [x] Type-aware formatting for JSON/UUID/dates
- [x] Checkbox selection column works
- [x] Scrolling remains smooth (60fps target)

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Performance regression | Medium | High | Profile before/after, lazy formatting |
| Cell formatter false positives | Medium | Low | Use column type hints when available |
| Sticky columns z-index issues | Medium | Medium | Careful layering with headers |

## Security Considerations
- Sanitize JSON display to prevent XSS
- Truncate very long cell values

## Next Steps
After completion:
- Phase 6 (Filter & Search) can use column menu integration
