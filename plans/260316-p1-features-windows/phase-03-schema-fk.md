# Phase 3 — Schema Switching & FK Navigation

> Est. effort: 4-5 days (2 parallel agents)
> Dependencies: None (FK nav uses existing schemaStore FK data)

---

## P1-5: PostgreSQL Schema Switching

### Overview
Ctrl+K quick switcher shows PostgreSQL schemas alongside databases. Selecting a schema filters sidebar tables to that schema.

### Approach: No VTable Change

The PostgreSQL driver already returns `table_schema` in `fetch_tables` results (`FfiTableInfo.schema`). Schema switching doesn't need a new FFI endpoint.

**Strategy:**
1. Fetch schema list via `execute("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema') ORDER BY schema_name")`
2. Store `currentSchema` in `schemaStore`
3. Frontend filters `tables` by `currentSchema`
4. Pass `schema` param to all fetch commands (already supported in `fetch_columns`, `fetch_indexes`, etc.)

### Implementation

**Backend (`commands/schema.rs`):**
- New command `fetch_schemas(sessionId)` — executes above SQL via `execute_query`, parses result
- OR: reuse existing `execute_query` and parse in frontend (simpler)
- Recommend: new `fetch_schemas` command for clean API

**Frontend (`stores/schemaStore.ts`):**
```typescript
// New state
schemas: string[];
currentSchema: string | null;

// Actions
fetchSchemas: (sessionId: string) => Promise<void>;
setCurrentSchema: (schema: string) => void;
```

**Quick Switcher (`components/shared/QuickSwitcher.tsx`):**
- Currently shows tables for fuzzy search
- Add section: when connected to PostgreSQL, show "Schemas" section above tables
- Selecting schema → `setCurrentSchema()`, re-filter sidebar

**Sidebar (`components/layout/Sidebar.tsx`):**
- Filter `tables` by `currentSchema` when set
- Show schema name in header or breadcrumb
- Database dropdown already exists → add schema sub-selector below it

### Files touched
- `src-tauri/src/commands/schema.rs` — add `fetch_schemas` command
- `src-tauri/src/lib.rs` — register command
- `src/ipc/commands.ts` — add `fetchSchemas` IPC
- `src/stores/schemaStore.ts` — schema list, current schema state
- `src/components/shared/QuickSwitcher.tsx` — schema section
- `src/components/layout/Sidebar.tsx` — schema filter, schema display

### Edge cases
- MySQL doesn't have schemas (database = schema) → hide schema switcher for MySQL
- MSSQL has schemas (dbo, etc.) → consider supporting later, skip for P1
- SQLite has no schemas → hide
- Schema with special chars in name → already quoted in SQL
- Switching schema clears table selection

---

## P1-8: FK Navigation Arrows

### Overview
Foreign key columns show a small arrow icon in grid cells. Clicking opens referenced table filtered by FK value.

### Data Flow

1. **Already available:** `fetch_foreign_keys(table)` returns FK metadata (column, referenced table, referenced column)
2. **New:** Store FK map in `schemaStore` per table
3. **Grid rendering:** For FK columns, render clickable arrow icon in cell
4. **Click handler:** Open new tab with `SELECT * FROM referenced_table WHERE ref_column = clicked_value`

### Implementation

**Schema Store (`stores/schemaStore.ts`):**
```typescript
// FK metadata map: tableName → { columnName → { refTable, refColumn, refSchema } }
fkMap: Map<string, Map<string, ForeignKeyRef>>;

// Populate when table is opened
fetchForeignKeysForTable: (sessionId: string, table: string, schema?: string) => Promise<void>;
```

**Grid Cell Rendering (`components/grid/`):**
- Check if current column name exists in `fkMap[currentTable]`
- If yes, render small `→` or `ExternalLink` icon after cell value
- Icon clickable, doesn't interfere with cell editing

**Navigation Handler:**
```typescript
const handleFkNavigation = (refTable: string, refColumn: string, value: string) => {
  // Create new tab
  const tab = addTab({
    title: refTable,
    tableName: refTable,
    content: `SELECT * FROM "${refTable}" WHERE "${refColumn}" = '${escapeValue(value)}'`,
  });
  // Execute the query
  execute(sessionId, tab.content);
};
```

**Alternative approach:** Instead of raw SQL, use the filter system:
- Open table tab for referenced table
- Apply filter: `refColumn = value`
- Reuses existing filter infrastructure from P0

**Recommend: Filter-based approach.** More robust, reuses existing code, no SQL injection risk.

### Files touched
- `src/stores/schemaStore.ts` — FK map, fetch FK per table
- `src/components/grid/data-grid.tsx` or cell renderer — arrow icon
- `src/components/grid/result-panel.tsx` — FK click handler, tab creation
- `src/components/layout/MainLayout.tsx` — wire FK navigation

### Edge cases
- Composite FKs (multi-column) → show arrow only if all FK columns have values
- Self-referencing FK (same table) → navigate to same table with filter
- NULL FK value → no arrow, can't navigate to NULL
- FK to table in different schema → include schema in navigation
- Circular FK references → user navigates freely, no cycle detection needed
- FK column is also editable → arrow icon in non-edit mode, hidden during edit
