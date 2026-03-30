---
phase: 2
features: [connection-url-import, connection-color, connection-tags, startup-commands]
effort: 3-4d
risk: LOW
---

# Phase 2: Connection Polish

## Context

- Plan: [plan.md](./plan.md)
- macOS ref: `ConnectionColorPicker.swift` (78L), `ConnectionTagEditor.swift` (222L)
- Windows model: `models/connection.rs` — `SavedConnection` has `group_id` but no `color`/`tag` fields

## Overview

Four small polishing features for connection UX: (1) parse connection URL strings, (2) color-code connections, (3) tag connections with environment labels, (4) run startup SQL after connecting.

---

## Feature 2A: Connection URL Import

**What:** "Paste Connection URL" button in ConnectionForm. Parse `mysql://user:pass@host:port/db`, `postgresql://...`, `mssql://...` into form fields.

### Implementation

#### [NEW] `src/utils/connection-url-parser.ts`
- `parseConnectionUrl(url: string): Partial<ConnectionConfig>`
- Support protocols: `mysql://`, `postgresql://`, `postgres://`, `mssql://`, `sqlserver://`
- Handle: user:password@host:port/database?params
- Handle edge cases: no port (use defaults), URL-encoded passwords, empty fields

#### [MODIFY] `src/components/connection/ConnectionForm.tsx`
- Add "Import from URL" button above form
- On click → show text input → paste URL → parse → fill form fields
- Validate parsed result before applying

### Tests
- Unit test `connection-url-parser.test.ts`: valid URLs for each protocol, edge cases (no port, special chars in password, missing database)

---

## Feature 2B: Connection Color

**What:** Color dot picker in ConnectionForm. Color shown in sidebar next to connection name and in toolbar.

### Implementation

#### [MODIFY] `src-tauri/src/models/connection.rs`
- Add `color: Option<String>` to `SavedConnection` (hex string, e.g. `"#ef4444"`)
- Add `#[serde(default)]` for backward compat

#### [MODIFY] `src-tauri/src/storage/connection_store.rs`
- No logic change needed — `color` flows through existing save/load

#### [NEW] `src/components/connection/connection-color-picker.tsx`
- 10 preset color dots + "None" option
- Colors: red, orange, amber, yellow, green, emerald, blue, indigo, purple, pink
- Horizontal row, selected = border ring

#### [MODIFY] `src/components/connection/ConnectionForm.tsx`
- Add `ConnectionColorPicker` below name field
- Bind to `config.color`

#### [MODIFY] `src/components/layout/Sidebar.tsx`
- Show color dot next to connection name in sidebar tree

---

## Feature 2C: Connection Tags

**What:** Tag connections with environment labels (Production, Staging, Dev, etc.) for visual identification.

### Implementation

#### [MODIFY] `src-tauri/src/models/connection.rs`
- Add `tag: Option<String>` to `SavedConnection` (tag name string)
- Preset tags: "production", "staging", "development", "testing", "local"
- Custom tags: user-defined strings

#### [NEW] `src/components/connection/connection-tag-picker.tsx`
- Dropdown with preset tags + "Custom..." option
- Each tag has colored badge (prod=red, staging=yellow, dev=green, test=blue, local=gray)

#### [MODIFY] `src/components/connection/ConnectionForm.tsx`
- Add `ConnectionTagPicker` below color field

#### [MODIFY] `src/components/layout/Sidebar.tsx`
- Show tag badge next to connection name (small colored pill)

#### [MODIFY] Toolbar area
- Show tag badge in toolbar when connected (visual indicator of environment)

---

## Feature 2D: Startup Commands

**What:** Run SQL statements automatically after connecting to a database. Configured per-connection in an "Advanced" section of ConnectionForm.

### Implementation

#### [MODIFY] `src-tauri/src/models/connection.rs`
- Add `startup_commands: Option<String>` to `ConnectionConfig` (multi-line SQL)
- `#[serde(default)]`

#### [MODIFY] `src-tauri/src/commands/connection.rs`
- After successful `connect()`: if `config.startup_commands` is non-empty, execute via driver's `execute()` method
- Log result, don't block connection on failure (warn only)

#### [MODIFY] `src/components/connection/ConnectionForm.tsx`
- Add "Advanced" collapsible section (or tab)
- Textarea for startup commands
- Placeholder: "SET search_path TO public;"

---

## File Ownership (Parallel Safety)

| Feature | Rust files | Frontend files |
|---------|-----------|----------------|
| 2A URL | — | `utils/connection-url-parser.ts` (new), `ConnectionForm.tsx` |
| 2B Color | `models/connection.rs` | `connection-color-picker.tsx` (new), `ConnectionForm.tsx`, `Sidebar.tsx` |
| 2C Tags | `models/connection.rs` | `connection-tag-picker.tsx` (new), `ConnectionForm.tsx`, `Sidebar.tsx` |
| 2D Startup | `models/connection.rs`, `commands/connection.rs` | `ConnectionForm.tsx` |

**Conflicts:** All 4 features modify `ConnectionForm.tsx` and `models/connection.rs`.
**Strategy:** Sequence 2B+2C+2D model changes, or single agent handles all Rust model changes. Frontend: single agent adds all 4 features to ConnectionForm.

## Todo

- [x] Add `color`, `tag`, `startup_commands` fields to Rust models
- [x] Implement connection URL parser (TypeScript)
- [x] Create color picker component
- [x] Create tag picker component
- [x] Add startup command textarea in Advanced section
- [x] Execute startup commands on connect
- [x] Show color + tag in sidebar
- [x] Unit tests: URL parser, model serde backward compat
- [ ] Manual: create connection with color + tag → verify shows in sidebar

## Success Criteria

- [ ] `mysql://user:pass@host:3306/db` fills form correctly
- [ ] Color dot visible in sidebar next to connection name
- [ ] Tag badge visible in sidebar + toolbar
- [ ] Startup SQL runs after connect (verified in query results)
- [ ] Old connections.json without new fields loads without error
