# TablePro Windows — Project Changelog

> Detailed record of development phases, features, and fixes for the Windows build.
>
> **Last Updated**: 2026-04-05

## Phase 4 — Localization & Release Polish (v0.4.0, 2026-04-05)

### Features

- Full i18n migration of all UI components using i18next + react-i18next
- Vietnamese (Tiếng Việt) translation with `vi.json` locale file
- Language selector in Settings panel
- Immediate language switching without app restart

### Scope

- All user-facing strings extracted to translation keys
- Locale files: `src/i18n/locales/en.json`, `src/i18n/locales/vi.json`
- i18n bootstrap: `src/i18n/index.ts`

---

## Phase 3 — Bulk Operations & Stored Procedures (v0.3.3, 2026-04-05)

### Features

- **Bulk insert**: TSV paste + CSV file drag-drop (50 MB cap, 500-row batches)
- **Bulk update**: structured filter builder with 10 operators, dry-run preview
- Transaction wrapping with partial failure reporting
- **Stored procedure execution**: parameter inputs, SQL preview, system procedure denylist
- **Procedure source viewer**: syntax highlighting, copy, edit, drop support
- Sidebar context menu for routines (Execute / View Source / Copy Name)

### Files Added

- Backend: `src-tauri/src/commands/bulk_ops.rs`, `src-tauri/src/commands/routine_ops.rs`
- Frontend: `src/components/grid/bulk-insert-dialog.tsx`, `src/components/grid/bulk-update-dialog.tsx`
- Frontend: `src/components/procedures/procedure-execute-dialog.tsx`, `src/components/procedures/procedure-source-panel.tsx`, `src/components/procedures/sidebar-routine-node.tsx`

---

## Phase 2 — Connections & Onboarding (v0.3.2, 2026-04-05)

### Features

- **Connection tag filtering**: chip bar in sidebar, create/delete tags with custom colors
- Multi-tag AND filtering with persistence across sessions
- **First-launch onboarding**: 3-step dialog (welcome, add connection, keyboard shortcuts)
- Draft mode connection form in onboarding (no zombie connection on cancel)

### Files Added

- Frontend: `src/components/connection/connection-tag-filter.tsx`, `src/components/connection/connection-tag-picker.tsx`
- Frontend: `src/components/onboarding/onboarding-dialog.tsx`, `src/components/onboarding/onboarding-step.tsx`, `src/components/onboarding/welcome-step.tsx`, `src/components/onboarding/add-connection-step.tsx`, `src/components/onboarding/quick-start-step.tsx`

---

## Phase 1 — Error Handling & EXPLAIN (v0.3.1, 2026-04-05)

### Features

- **Error classifier**: `classifyError` with kind-based recovery hints
- Upgraded toast system with severity levels (info, warning, error) and action buttons
- **EXPLAIN query viewer**: PostgreSQL, MySQL, MSSQL, SQLite support
- Universal tree parser renders all engine EXPLAIN plans uniformly
- `Ctrl+Shift+X` keyboard shortcut for EXPLAIN
- i18n framework setup (i18next + react-i18next wiring)

### Files Added

- Backend: `src-tauri/src/commands/explain.rs`
- Frontend: `src/components/editor/explain-panel.tsx`, `src/components/editor/explain-node.tsx`
- Frontend: `src/ipc/error.ts` (classifyError), `src/hooks/useToast.ts` (enhanced)
- i18n: `src/i18n/index.ts`, `src/i18n/locales/en.json`

---

**Document Status**: Active
