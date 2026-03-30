# Phase 2 — Connection Groups & Full Safe Mode

> Est. effort: 4-5 days (2 parallel agents)
> Dependencies: None

---

## P1-4: Connection Groups (Sidebar Folders)

### Overview
Organize connections into collapsible folder groups on Welcome screen. Groups have name, color, order. Connections assigned to groups via dropdown.

### Data Model

**Rust (`models/connection.rs`):**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    pub color: String,       // hex color e.g. "#ef4444"
    pub order: i32,
    pub collapsed: bool,
}
```

**`SavedConnection` extension:**
```rust
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub config: ConnectionConfig,
    pub group_id: Option<String>,  // NEW
}
```

### Storage

**`storage/connection_store.rs`:**
- `groups: Vec<ConnectionGroup>` field alongside `connections`
- Persist to `%APPDATA%/TablePro/groups.json` (separate file, no migration needed)
- Or embed in `connections.json` with backward compat (missing field = no group)

**New Tauri commands:**
- `list_groups() → Vec<ConnectionGroup>`
- `save_group(group: ConnectionGroup)`
- `delete_group(id: String)` — moves connections to ungrouped

### Frontend

**Welcome screen (`components/connection/`):**
1. Render groups as collapsible sections with colored header
2. Ungrouped connections at bottom
3. Chevron toggle for collapse/expand
4. Right-click context menu on group: Rename, Change Color, Delete
5. Connection form: dropdown to assign group

**No drag-drop in P1.** Connections assigned via form dropdown. Drag-drop deferred to P2.

### Files touched
- `src-tauri/src/models/connection.rs` — add `ConnectionGroup`, extend `SavedConnection`
- `src-tauri/src/storage/connection_store.rs` — groups persistence
- `src-tauri/src/commands/storage.rs` — new commands
- `src-tauri/src/lib.rs` — register new commands
- `src/ipc/commands.ts` — add group IPC calls
- `src/stores/connectionStore.ts` — add groups state
- `src/components/connection/` — group rendering, context menu, form dropdown

### Edge cases
- Delete group with connections → connections become ungrouped
- Group color validation → hex format
- Empty group name → reject
- Migration: existing connections.json without `groupId` → treated as ungrouped

---

## P1-7: Full Safe Mode Levels (6 Levels)

### Overview
Replace boolean `safeMode` toggle with 6-level safety system matching macOS.

### Levels

| Level | Name | Behavior |
|-------|------|----------|
| 0 | Off | No protection |
| 1 | Silent | Log dangerous queries, no UI |
| 2 | Alert | Confirm dialog for DELETE/DROP/TRUNCATE |
| 3 | Alert Full | Confirm for all DML (INSERT/UPDATE/DELETE) + DDL |
| 4 | Safe Mode | Confirm + require table name confirmation in dialog |
| 5 | Read-Only | Block all write operations |

### Dangerous Query Detection

**Regex patterns (frontend-side):**
```typescript
const DESTRUCTIVE_DDL = /\b(DROP|TRUNCATE|ALTER)\b/i;
const DESTRUCTIVE_DML = /\b(DELETE)\b/i;
const ALL_DML = /\b(INSERT|UPDATE|DELETE)\b/i;
const ALL_WRITE = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i;
```

### Implementation

**Settings:**
- Replace `safeMode: boolean` with `safeModeLevel: number` (0-5)
- No migration needed — app has no public release yet (only test builds), safe to change schema directly
- Default for new installs: `2` (Alert)

**Confirmation dialog:**
- React modal component `SafeModeConfirmDialog`
- Shows detected danger level, SQL preview (truncated), table name
- Level 4: additional text input requiring user to type table name
- Level 5: block execution entirely, show "Read-Only mode" message

**Toolbar indicator:**
- Show lock icon with level label when level > 0
- Click to cycle through levels (or open settings)

**Integration points:**
- `useQueryStore.execute()` — check safe mode before IPC call
- `saveChanges()` — check safe mode before save IPC
- Toolbar — display current level

### Files touched
- `src/types/settings.ts` — add `safeModeLevel`
- `src/stores/settingsStore.ts` — migration logic
- `src/stores/queryStore.ts` — safe mode check before execute
- `src/components/shared/SafeModeConfirmDialog.tsx` (new)
- `src/components/layout/Toolbar.tsx` — level indicator
- `src/components/settings/settings-connection.tsx` — level selector (dropdown instead of toggle)
- Rust `settings_store.rs` — backward compat for settings JSON

### Edge cases
- No migration concern — no public release yet, only test builds
- Level 5 (Read-Only) must also block save_changes, not just execute_query
- Raw SQL editor bypass: user can still type DROP — we confirm, not prevent typing
- Multi-statement SQL: scan entire text, not just first statement
