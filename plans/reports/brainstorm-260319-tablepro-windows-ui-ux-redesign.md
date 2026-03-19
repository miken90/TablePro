# TablePro Windows UI/UX Redesign Brainstorm

**Date**: 2026-03-19  
**Type**: Design Strategy Report  
**Scope**: Complete UI/UX redesign direction for TablePro Windows

---

## 1. Design Vision

- **Data-first, chrome-minimal**: Maximize viewport for data; hide UI elements until needed
- **Keyboard-native**: Every action reachable via keyboard; mouse optional for power users
- **Contextual intelligence**: Surface relevant actions/info based on current context (table type, data type, selection)
- **Familiar muscle memory**: Borrow proven shortcuts from VS Code, TablePlus, DataGrip
- **macOS-quality polish on Windows**: Native feel with fluid animations, precision spacing, and attention to detail

---

## 2. Target Users

### Primary Personas

| Persona | Goals | Frustrations |
|---------|-------|--------------|
| **Backend Developer** | Quick data checks, debug queries, manual fixes | Slow startup, too many clicks to connect, complex UI for simple tasks |
| **DBA** | Schema management, performance monitoring, bulk operations | Missing pro features, poor keyboard support, no scripting |
| **Data Engineer** | Large dataset exploration, cross-DB queries, export pipelines | Poor handling of 100K+ rows, limited export options, no query history search |
| **DevOps/SRE** | Quick connection to prod/staging, safe read-only access | Dangerous write defaults, no connection grouping, unclear env indicators |

### Key Behavioral Patterns

- Open 3-8 connections simultaneously
- Run same query patterns repeatedly across sessions
- Need to visually distinguish prod vs staging connections
- Prefer dark mode (80%+ of developer tools users)
- Expect Cmd/Ctrl+S, Cmd/Ctrl+Enter, Cmd/Ctrl+P muscle memory

---

## 3. UX Problems to Solve

### Critical Issues (Blocking Productivity)

1. **Connection friction**: Too many clicks from launch to first query
2. **Data grid limitations**: No virtualization → freezes on large tables
3. **Query editor basics missing**: No autocomplete context awareness, weak error highlighting
4. **No spatial memory**: Tabs look identical; hard to find the right one
5. **Destructive action anxiety**: Easy to accidentally modify prod data

### High-Impact Issues

6. **Filter UX**: Current filter panel is detached from data context
7. **Schema navigation**: Deep nesting requires too much clicking
8. **Multi-database workflow**: Switching between connections is jarring
9. **History discovery**: Query history exists but isn't surfaced well
10. **Settings sprawl**: Too many settings, poorly organized

### Polish Issues

11. **Inconsistent spacing**: Visual rhythm varies across panels
12. **Animation jank**: Some transitions feel abrupt
13. **Icon inconsistency**: Mixed icon styles (solid/outline)
14. **Focus states**: Not visible enough in dark mode

---

## 4. UI/UX Redesign Ideas

### 4.1 Layout Structure

**Current Problem**: Fixed 3-panel layout wastes space; panels compete for attention

**Proposed Redesign**:
- **Adaptive panels**: Collapsible sidebar, auto-hide inspector, resizable panes with memory
- **Focus mode**: `Cmd/Ctrl+\` hides all chrome except active editor/grid
- **Split views**: Horizontal/vertical split for comparing tables or query+results
- **Golden ratio**: Default 240px sidebar, 320px inspector (when open)

**Expected Benefit**: 15-25% more data visible; reduces cognitive load

### 4.2 Sidebar / Navigation

**Current Problem**: Flat connection list doesn't scale; no visual hierarchy

**Proposed Redesign**:
- **Connection groups**: Collapsible groups (Production, Staging, Local) with color coding
- **Fuzzy finder**: `Cmd/Ctrl+P` opens quick switcher searching tables, connections, history
- **Recents rail**: Vertical strip showing 5 most recent tables/queries (like VS Code activity bar)
- **Connection health**: Subtle pulse indicator for connected vs disconnected
- **Environment badges**: Red "PROD", yellow "STAGING" chips on connection items

**Expected Benefit**: Find any resource in <2 seconds; reduce accidental prod writes

### 4.3 Database Explorer

**Current Problem**: Tree view requires excessive clicking; no search within tree

**Proposed Redesign**:
- **Inline search**: Type anywhere in tree to filter (no separate search box)
- **Quick actions**: Right-click menu with most common actions (SELECT *, Edit, Copy Name)
- **Lazy loading**: Load children on expand only; show skeleton placeholders
- **Type icons**: Distinct icons for tables vs views vs functions vs indexes
- **Size hints**: Small badge showing row count estimate (e.g., "~1.2M")

**Expected Benefit**: 50% fewer clicks to reach target table

### 4.4 Table / Data Grid

**Current Problem**: Basic table with no virtualization; editing is clunky

**Proposed Redesign**:
- **Virtualized rendering**: TanStack Virtual or react-window for 100K+ rows
- **Sticky columns**: First N columns pinnable (like Excel freeze panes)
- **Column actions menu**: Click header for sort/filter/hide/copy column
- **Inline editing**: Double-click cell → edit; Tab to move; Enter to commit
- **Diff mode**: Highlight pending changes with colored gutter (green=insert, yellow=update, red=delete)
- **Row selection**: Checkbox column for bulk operations
- **NULL styling**: Distinct `NULL` badge (italic gray) vs empty string
- **Type-aware formatting**: Dates, JSON, UUIDs get special treatment
- **Copy intelligence**: Cmd+C copies cell value; Shift copies as SQL literal

**Expected Benefit**: Handle large datasets without freezing; faster editing

### 4.5 SQL Editor

**Current Problem**: Basic CodeMirror without context-aware autocomplete

**Proposed Redesign**:
- **Context-aware autocomplete**: Know current table context, suggest columns first
- **Inline errors**: Squiggly underlines with hover tooltips (like VS Code)
- **Query cost preview**: Show EXPLAIN estimate before execution (opt-in)
- **Parameterized queries**: Support `:name` or `$1` syntax with prompt
- **Result preview**: Small "Run" button that shows first 10 rows inline
- **Multi-statement handling**: Clear visual separation between statements
- **Vim mode**: Existing; ensure all commands work
- **Format on save**: Optional SQL formatter integration
- **Snippet library**: User-defined snippets with Tab expansion

**Expected Benefit**: Faster query writing; fewer syntax errors

### 4.6 Tabs / Workspaces

**Current Problem**: Tabs are visually identical; no grouping

**Proposed Redesign**:
- **Tab coloring**: Inherit connection color for visual grouping
- **Tab icons**: Show query vs table vs structure icon
- **Tab preview**: Hover shows first 3 lines of query or table preview
- **Tab groups**: Drag tabs to create groups (like Chrome)
- **Pin tabs**: Pinned tabs stay left, can't be accidentally closed
- **Preview tabs**: Single-click opens preview (italic title); double-click pins
- **Workspace save**: Save/restore entire tab arrangement

**Expected Benefit**: Never lose context; faster tab navigation

### 4.7 Filtering / Search

**Current Problem**: Filter panel is disconnected; requires too many clicks

**Proposed Redesign**:
- **Quick filter bar**: Always-visible search box above grid (like macOS Finder)
- **Smart parsing**: Type `status:active created:>2024-01-01` in search bar
- **Column filters**: Click column header → dropdown with type-aware filter
- **Filter chips**: Active filters shown as removable chips above grid
- **Saved filters**: Named filter presets per table
- **Filter history**: Recent filter combinations

**Expected Benefit**: Filter data in <3 seconds; no panel switching

### 4.8 Forms / Modals

**Current Problem**: Modals are generic; too much information at once

**Proposed Redesign**:
- **Command palette**: `Cmd/Ctrl+Shift+P` for all commands (no modal hunting)
- **Slide-over panels**: Inspector/settings slide from right (not blocking modals)
- **Progressive disclosure**: Advanced options collapsed by default
- **Inline editing**: Edit connection settings inline in sidebar where possible
- **Confirmation dialogs**: Dangerous actions require typing table name

**Expected Benefit**: Less modal fatigue; faster access to settings

### 4.9 Notifications / Errors

**Current Problem**: Errors are easy to miss; success is silent

**Proposed Redesign**:
- **Toast system**: Bottom-right toasts with action buttons (Undo, View Details)
- **Error panel**: Dedicated error log panel (toggleable) with stack traces
- **Query status**: Inline status below editor ("Running... 2.3s", "✓ 1,234 rows")
- **Connection events**: Subtle notification when connection drops/reconnects
- **Sound feedback**: Optional subtle sounds for completion/error

**Expected Benefit**: Never miss an error; clear feedback loop

### 4.10 Settings / Preferences

**Current Problem**: Settings are scattered; hard to find specific option

**Proposed Redesign**:
- **Search settings**: Type to filter settings (like VS Code)
- **Categorized tabs**: General, Editor, Appearance, Connections, Keyboard
- **Preview changes**: Live preview for appearance settings
- **Reset to default**: Per-setting reset button
- **Import/export**: Settings sync via JSON file
- **Profiles**: Switch between setting profiles (e.g., "Presentation mode")

**Expected Benefit**: Find any setting in <5 seconds

---

## 5. Competitive Inspiration

### From TablePlus

| Pattern | How to Adapt |
|---------|--------------|
| **Clean sidebar** | Simple tree with subtle hover states; no visual noise |
| **Tab colors** | Inherit from connection; subtle border-bottom indicator |
| **Inline cell editing** | Double-click → edit; preserve cell height |
| **Query result tabs** | Results appear below editor with tab strip |
| **Dark-first design** | Design dark mode first, derive light mode |

### From DataGrip

| Pattern | How to Adapt |
|---------|--------------|
| **Database introspection** | Show column types, constraints, indexes inline |
| **Smart autocomplete** | Use LSP-style completions with documentation |
| **Diagrams** | Add ER diagram view for visual schema exploration |
| **Refactoring tools** | Safe rename with preview of affected queries |

### From VS Code (Not a DB tool but UX gold)

| Pattern | How to Adapt |
|---------|--------------|
| **Command palette** | `Cmd/Ctrl+Shift+P` → all actions searchable |
| **Quick open** | `Cmd/Ctrl+P` → fuzzy find any table/query |
| **Settings search** | Instant filter in settings UI |
| **Minimap** | Optional minimap in SQL editor for long scripts |
| **Breadcrumbs** | Show: Connection > Database > Schema > Table |

### Anti-Patterns to Avoid

- **DBeaver**: UI density without hierarchy; overwhelming for new users
- **phpMyAdmin**: Web-first compromises; clunky for desktop
- **MySQL Workbench**: Outdated visual style; modal-heavy

---

## 6. Visual Design Direction

### Typography

```css
/* Recommended Font Stack */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;

/* Scale (1.2 ratio) */
--text-xs: 11px;    /* Metadata, badges */
--text-sm: 13px;    /* Secondary UI, table cells */
--text-base: 14px;  /* Primary UI, body */
--text-lg: 16px;    /* Section headers */
--text-xl: 20px;    /* Panel titles */
```

### Spacing

```css
/* 4px base unit */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;

/* Component-specific */
--sidebar-item-padding: 6px 12px;
--grid-cell-padding: 4px 8px;
--input-padding: 8px 12px;
```

### Color System (Dark Mode First)

```css
/* Backgrounds (darkest to lightest) */
--bg-base: #0f1419;      /* Main canvas */
--bg-surface: #151b23;   /* Panels, cards */
--bg-elevated: #1c2431;  /* Popovers, dropdowns */
--bg-muted: #252d3a;     /* Hover states */

/* Borders */
--border-subtle: #2d3848;
--border-default: #3d4a5c;
--border-strong: #4d5e73;

/* Text */
--text-primary: #e6edf3;
--text-secondary: #8b949e;
--text-muted: #6e7681;
--text-disabled: #484f58;

/* Accents */
--accent-blue: #58a6ff;   /* Links, primary actions */
--accent-green: #3fb950;  /* Success, inserts */
--accent-yellow: #d29922; /* Warnings, updates */
--accent-red: #f85149;    /* Errors, deletes */
--accent-purple: #a371f7; /* Special (JSON, UUID) */

/* Connection Environment Colors */
--env-prod: #f85149;
--env-staging: #d29922;
--env-dev: #3fb950;
--env-local: #58a6ff;
```

### Light Mode (Derived)

```css
--bg-base: #ffffff;
--bg-surface: #f6f8fa;
--bg-elevated: #ffffff;
--bg-muted: #eaeef2;
--border-subtle: #d1d9e0;
--text-primary: #1f2328;
--text-secondary: #656d76;
```

### Icons

- **Library**: Lucide Icons (consistent stroke width, MIT license)
- **Size**: 16px for inline, 20px for buttons, 24px for empty states
- **Color**: `currentColor` for automatic theme adaptation
- **Custom icons**: Only for database-specific types (Postgres, MySQL, etc.)

### Data Density Modes

| Mode | Cell Height | Font Size | Use Case |
|------|-------------|-----------|----------|
| Compact | 28px | 12px | Large datasets, many columns |
| Default | 36px | 14px | General use |
| Comfortable | 44px | 14px | Touch screens, presentations |

### Animation Principles

```css
/* Duration */
--duration-instant: 50ms;   /* Hover states */
--duration-fast: 150ms;     /* Micro-interactions */
--duration-normal: 250ms;   /* Panel transitions */
--duration-slow: 400ms;     /* Page transitions */

/* Easing */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);  /* Enter */
--ease-in: cubic-bezier(0.7, 0, 0.84, 0);   /* Exit */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

### macOS-Inspired Polish Details

- **Focus rings**: 2px offset, accent color, subtle glow
- **Shadows**: Layered (umbra + penumbra) for depth
- **Scrollbars**: Thin, auto-hide, custom styled
- **Selection**: Blue tint with slight rounded corners
- **Drag handles**: Only visible on hover

---

## 7. Power-User Features

### Keyboard-Centric Workflows

| Action | Shortcut | Notes |
|--------|----------|-------|
| Quick switcher | `Cmd/Ctrl+P` | Fuzzy search everything |
| Command palette | `Cmd/Ctrl+Shift+P` | All commands |
| Run query | `Cmd/Ctrl+Enter` | Execute current statement |
| Run all | `Cmd/Ctrl+Shift+Enter` | Execute entire editor |
| New query tab | `Cmd/Ctrl+N` | |
| Close tab | `Cmd/Ctrl+W` | |
| Next tab | `Cmd/Ctrl+Tab` | |
| Toggle sidebar | `Cmd/Ctrl+B` | |
| Toggle inspector | `Cmd/Ctrl+I` | |
| Focus filter | `Cmd/Ctrl+F` | |
| Navigate to table | `Cmd/Ctrl+Shift+T` | |
| Format SQL | `Shift+Alt+F` | |

### Advanced Query Features

- **Query parameters**: `:name` syntax with prompt dialog
- **Query macros**: `$CURRENT_DATE`, `$USER`, `$CONNECTION`
- **Query snippets**: User-defined with Tab trigger
- **Multi-cursor editing**: Cmd+D to select next occurrence
- **Vertical selection**: Alt+Shift+Click for column selection

### Data Operations

- **Bulk update**: Select rows → Apply formula to column
- **Data generation**: Right-click column → Generate fake data
- **Export templates**: Save export format configurations
- **Import mapping**: Remember CSV→Table column mappings

### Developer Integrations

- **Copy as code**: Copy result as Python dict, JS object, Go struct
- **Generate ORM**: Create model code from table structure
- **CLI mode**: `tablepro --query "SELECT..." --connection prod`
- **URL handler**: `tablepro://connect?host=...` deep links

---

## 8. Priority Roadmap

### Quick Wins (1-2 weeks each)

| Item | Impact | Effort | Files Affected |
|------|--------|--------|----------------|
| Connection color badges | High | Low | connectionStore, sidebar |
| Quick filter bar | High | Medium | FilterPanel, grid |
| Tab icons + colors | Medium | Low | EditorTabs |
| Toast notifications | Medium | Low | Add toast system |
| Keyboard shortcut help (`?`) | Medium | Low | Modal component |
| NULL styling in grid | Low | Low | DataGrid cell renderer |

### Medium Effort (1-2 months)

| Item | Impact | Effort | Notes |
|------|--------|--------|-------|
| Command palette | High | Medium | Requires action registry |
| Grid virtualization | High | High | TanStack Virtual integration |
| Context-aware autocomplete | High | High | LSP-like completion engine |
| Inline cell editing | High | Medium | Edit mode state machine |
| Split view | Medium | Medium | Layout system refactor |
| Settings search | Medium | Low | Fuse.js integration |

### High-Impact Long-Term (3-6 months)

| Item | Impact | Effort | Notes |
|------|--------|--------|-------|
| ER diagram view | High | Very High | Canvas rendering, layout algorithm |
| Query cost preview | Medium | High | EXPLAIN integration per driver |
| Workspace save/restore | Medium | Medium | Serialization system |
| Plugin UI extensibility | High | Very High | Component registry for plugins |
| AI query assistant | High | Very High | LLM integration for natural language |

---

## 9. Design System Establishment

### Recommended Approach

1. **Create `/docs/design-guidelines.md`** documenting tokens above
2. **Tailwind config** with custom tokens matching the system
3. **Component library audit** against the guidelines
4. **Storybook setup** for component documentation

### Design Tokens File Structure

```
src/
  styles/
    tokens/
      colors.ts      # Color primitives + semantic
      typography.ts  # Font families, sizes, weights
      spacing.ts     # Space scale
      shadows.ts     # Elevation levels
      animations.ts  # Durations, easings
    globals.css      # CSS custom properties
    themes/
      dark.css
      light.css
```

---

## 10. Open Questions

1. **Virtualization library**: TanStack Virtual vs react-window vs custom?
2. **Command palette framework**: cmdk vs kbar vs custom?
3. **Icon library migration**: Lucide vs current icons?
4. **Design tool**: Should we create Figma source-of-truth?
5. **A/B testing**: How to validate UX improvements?
6. **Accessibility audit**: Should we target WCAG AA or AAA?

---

## 11. Next Steps

If proceeding with this redesign direction:

1. **Create design guidelines doc** (`/docs/design-guidelines.md`)
2. **Audit current components** against proposed tokens
3. **Prototype command palette** (quick win with high visibility)
4. **Plan grid virtualization** (critical for large data)
5. **User testing** on current pain points before and after

---

**Author**: UI/UX Designer Agent  
**Status**: Brainstorm Complete  
**Next Action**: User decision on implementation plan creation
