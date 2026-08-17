# Technical Journal: Table Tab Caching Fix & UX Enhancements
Date: 2026-06-04

## Context & Motivation
1. **Caching**: Users switching between table tabs noticed high server load due to repeated database queries. Caching results locally per tab ID resolves this bottleneck.
2. **Export button**: The export button in table-browse mode was unresponsive because the rendering condition checked `activeConnectionId` from the SQL editor's `queryStore`.
3. **Text selection**: Double-clicking a cell automatically called `select()` on the input editor, wiping out the user's focus caret and preventing standard range selection.

## Decisions & Design
1. **Global Caching Store**: Introduced `useTableDataStore` to persist the results (`QueryResult`), sorting, pagination, and enum metadata associated with each `tabId`, with automatic cleanup on tab close and connection switch.
2. **Table Mode Export**: Enabled the export dialog for tables by checking the `sessionId` prop and constructing a non-paginated `exportSql` select query representing the active table's contents, filters, and sort orders.
3. **Caret-Aware Inline Editing**: Expanded `editingCell` tracking with an activation trigger ('click' | 'keyboard'). By passing this trigger to `CellEditor`, we selectively call `select()` only on keyboard trigger (Enter key), keeping standard double-click caret selection functional.

## Technical Details
- File created: `tablepro-windows/src/stores/table-data-store.ts`
- Test file created: `tablepro-windows/src/stores/table-data-store.test.ts`
- Files modified:
  - `tablepro-windows/src/components/grid/hooks/use-table-data.ts`
  - `tablepro-windows/src/components/grid/result-panel.tsx`
  - `tablepro-windows/src/components/grid/grid-row.tsx`
  - `tablepro-windows/src/components/grid/cell-editor.tsx`
  - `tablepro-windows/src/components/grid/hooks/use-grid-actions.ts`
  - `tablepro-windows/src/components/grid/hooks/use-grid-navigation.ts`
  - `tablepro-windows/src/components/grid/hooks/use-grid-clipboard.ts`

## Verification
- TypeScript compiles cleanly without error (`npx tsc --noEmit`).
- Prettier/ESLint checks pass with 0 errors.
- Vitest unit tests pass successfully (259/259 tests passed).
- Rust unit tests pass successfully (293/293 tests passed).
