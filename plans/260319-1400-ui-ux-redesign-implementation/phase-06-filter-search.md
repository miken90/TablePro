# Phase 6: Filter & Search UX

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P2
- **Status:** Completed ✅
- **Effort:** 10h
- **Parallel:** No (depends on Phase 5)

Redesign filter experience with inline quick filter bar, smart search syntax, and filter chips.

## Key Insights
- `FilterPanel` exists as collapsible panel
- `filterStore.ts` tracks per-tab filters
- Quick search exists but separate from filters
- No visual filter chips
- No smart parsing (e.g., `status:active`)

## Requirements

### Functional
- [ ] Quick filter bar always visible above grid
- [ ] Smart search syntax: `column:value`, `>`, `<`, `!=`
- [ ] Filter chips showing active conditions
- [ ] Click column header → quick filter for that column
- [ ] Saved filter presets (already backend support)
- [ ] Clear all filters button

### Non-Functional
- [ ] Filter parsing <10ms
- [ ] No layout shift when filters change
- [ ] Design tokens from Phase 1

## Architecture

### Smart Filter Parser
```typescript
// utils/filter-parser.ts
interface FilterCondition {
  column?: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'starts' | 'ends';
  value: string;
}

function parseFilterQuery(query: string): FilterCondition[] {
  // Examples:
  // "status:active" → { column: 'status', operator: '=', value: 'active' }
  // "age:>25" → { column: 'age', operator: '>', value: '25' }
  // "john" → { operator: 'contains', value: 'john' }
}
```

### Filter Chip Component
```tsx
// filter-chip.tsx
export function FilterChip({ condition, onRemove }) {
  const label = condition.column 
    ? `${condition.column} ${condition.operator} ${condition.value}`
    : condition.value;
  
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
      {label}
      <button onClick={onRemove}>
        <X size={12} />
      </button>
    </span>
  );
}
```

## Related Code Files

### Modify
- `tablepro-windows/src/components/filter/filter-panel.tsx` — Main filter UI
- `tablepro-windows/src/stores/filterStore.ts` — Filter state
- `tablepro-windows/src/components/grid/grid-header.tsx` — Column filter trigger

### Create
- `tablepro-windows/src/components/filter/quick-filter-bar.tsx`
- `tablepro-windows/src/components/filter/filter-chip.tsx`
- `tablepro-windows/src/components/filter/filter-preset-menu.tsx`
- `tablepro-windows/src/utils/filter-parser.ts`

## Implementation Steps

### Step 1: Create Filter Parser (2h)
```typescript
// filter-parser.ts
const COLUMN_PATTERN = /^(\w+):(!=|>=|<=|>|<|=)?(.+)$/;

export function parseFilterQuery(query: string): FilterCondition[] {
  const conditions: FilterCondition[] = [];
  const parts = query.split(/\s+AND\s+/i);
  
  for (const part of parts) {
    const match = part.match(COLUMN_PATTERN);
    if (match) {
      conditions.push({
        column: match[1],
        operator: (match[2] || '=') as FilterCondition['operator'],
        value: match[3],
      });
    } else {
      conditions.push({ operator: 'contains', value: part.trim() });
    }
  }
  
  return conditions;
}

export function buildWhereClause(conditions: FilterCondition[]): string {
  // Generate SQL WHERE clause from parsed conditions
}
```

### Step 2: Create Quick Filter Bar (3h)
```tsx
// quick-filter-bar.tsx
export function QuickFilterBar({ tabId, columns }) {
  const [query, setQuery] = useState('');
  const { conditions, setConditions, appliedFilterClause } = useFilterStore();
  
  const handleQueryChange = (value: string) => {
    setQuery(value);
    const parsed = parseFilterQuery(value);
    setConditions(tabId, parsed);
  };
  
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 bg-surface">
      <Search size={14} className="text-muted" />
      <input
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        placeholder="Filter... (e.g., status:active, age:>25)"
        className="flex-1 bg-transparent text-sm outline-none"
      />
      {conditions.length > 0 && (
        <button onClick={clearAll} className="text-xs text-muted hover:text-primary">
          Clear
        </button>
      )}
    </div>
  );
}
```

### Step 3: Create Filter Chip Component (1h)
- Display condition in human-readable format
- Remove button with hover state
- Different colors for different operators

### Step 4: Create Filter Chips Container (1h)
```tsx
// Render below quick filter bar
<div className="flex flex-wrap gap-1.5 px-3 py-1">
  {conditions.map((cond, i) => (
    <FilterChip key={i} condition={cond} onRemove={() => removeCondition(i)} />
  ))}
</div>
```

### Step 5: Add Column Filter Trigger (1.5h)
- Click column header → opens quick filter with column prefilled
- E.g., click "status" header → filter bar shows `status:`

### Step 6: Create Filter Preset Menu (1.5h)
- Dropdown showing saved presets
- Save current filter as preset
- Apply preset to current view

## Todo List
- [x] Create `filter-parser.ts` with smart syntax parsing
- [x] Create `QuickFilterBar` component
- [x] Create `FilterChip` component
- [x] Create filter chips container
- [x] Update `filterStore` to handle parsed conditions
- [x] Add column filter trigger in `GridHeader`
- [x] Create `FilterPresetMenu` component
- [x] Wire up preset save/load from existing backend
- [x] Replace old filter panel with new quick filter
- [x] Add syntax help tooltip in filter bar
- [x] Test filter parsing edge cases
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] Quick filter bar visible above grid
- [x] Smart syntax works: `column:value`, `column:>value`
- [x] Filter chips display all active conditions
- [x] Clicking chip X removes that condition
- [x] Column header click focuses filter with column prefix
- [x] Filter presets save and load

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Parser SQL injection | High | Critical | Sanitize all values, use parameterized queries |
| Complex filter syntax confuses users | Medium | Medium | Add syntax help tooltip |
| Layout shift with chips | Low | Low | Reserve space for chip row |

## Security Considerations
- **CRITICAL**: Sanitize all filter values before SQL generation
- Use allowlist for column names
- Escape special characters in LIKE patterns

## Next Steps
After completion:
- Phase 8 will audit filter accessibility
