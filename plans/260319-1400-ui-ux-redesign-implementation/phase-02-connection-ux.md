# Phase 2: Connection UX Enhancements

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P1
- **Status:** Completed ✅
- **Effort:** 8h
- **Parallel:** Yes (with Phase 1)

Add environment badges, improve connection grouping, and enhance visual indicators for connection states.

## Key Insights
- Connections have `color` and `tag` fields (used)
- Tags exist: `local`, `staging`, `production`, `testing`, `development`
- Current sidebar shows small color dot + tag label
- No visual distinction between connected vs disconnected
- Missing: environment-level visual hierarchy

## Requirements

### Functional
- [ ] Environment badges: PROD (red), STAGING (yellow), DEV (green), LOCAL (blue)
- [ ] Connection status indicator (connected/disconnected/connecting)
- [ ] Connection groups in sidebar (collapsible)
- [ ] Quick-connect from recent connections

### Non-Functional
- [ ] Badge colors from design tokens (Phase 1)
- [ ] Smooth status transitions (150ms)
- [ ] Keyboard navigable connection list

## Architecture

### Connection Status Model
```typescript
// connectionStore.ts
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  lastConnected?: Date;
  error?: string;
}
```

### Environment Badge Component
```tsx
// components/connection/environment-badge.tsx
type Environment = 'production' | 'staging' | 'development' | 'testing' | 'local';

const envColors: Record<Environment, string> = {
  production: 'bg-red-500/20 text-red-400 border-red-500/30',
  staging: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  development: 'bg-green-500/20 text-green-400 border-green-500/30',
  testing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  local: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};
```

## Related Code Files

### Modify
- `tablepro-windows/src/stores/connectionStore.ts` — Add status tracking
- `tablepro-windows/src/components/layout/Sidebar.tsx` — Connection list UI
- `tablepro-windows/src/components/connection/connection-tag-picker.tsx` — Tag colors

### Create
- `tablepro-windows/src/components/connection/environment-badge.tsx`
- `tablepro-windows/src/components/connection/connection-status-indicator.tsx`
- `tablepro-windows/src/components/connection/connection-group.tsx`

## Implementation Steps

### Step 1: Create Environment Badge Component (1h)
```tsx
// environment-badge.tsx
export function EnvironmentBadge({ tag }: { tag: string | null }) {
  if (!tag) return null;
  
  const env = tag as Environment;
  const colorClass = envColors[env] || 'bg-zinc-500/20 text-zinc-400';
  const label = env === 'production' ? 'PROD' 
    : env === 'staging' ? 'STAGE'
    : env === 'development' ? 'DEV'
    : env === 'local' ? 'LOCAL'
    : env.toUpperCase().slice(0, 4);
  
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colorClass}`}>
      {label}
    </span>
  );
}
```

### Step 2: Create Status Indicator Component (1h)
```tsx
// connection-status-indicator.tsx
export function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  const classes = {
    connected: 'bg-green-500 animate-none',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-zinc-400',
    error: 'bg-red-500',
  };
  
  return (
    <span 
      className={`h-2 w-2 rounded-full ${classes[status]}`}
      title={status}
    />
  );
}
```

### Step 3: Update Connection Store (2h)
- Add `connectionStatuses: Map<string, ConnectionStatus>`
- Track status on connect/disconnect/error
- Persist last connected timestamp

### Step 4: Update Sidebar Connection List (2h)
- Replace current dot with `ConnectionStatusIndicator`
- Add `EnvironmentBadge` next to connection name
- Group connections by tag (Production, Staging, Other)
- Make groups collapsible

### Step 5: Add Recent Connections Section (1h)
- Show top 3 most recently connected
- One-click reconnect
- Show time since last connection

### Step 6: Visual Polish (1h)
- Hover states with elevation
- Focus outlines for keyboard nav
- Smooth expand/collapse animations

## Todo List
- [x] Create `environment-badge.tsx` component
- [x] Create `connection-status-indicator.tsx` component
- [x] Add `connectionStatuses` to connectionStore
- [x] Update connection flow to track status
- [x] Create `connection-group.tsx` for collapsible sections
- [x] Update Sidebar.tsx to use new components
- [x] Add recent connections section
- [x] Test keyboard navigation in connection list
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] Environment badges visible for all tagged connections
- [x] Status indicator shows connected/connecting/disconnected
- [x] Connection groups collapsible
- [x] Recent connections accessible
- [x] Keyboard navigable with Tab/Enter

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Status tracking race conditions | Medium | Medium | Use proper state management |
| Badge colors conflict with Phase 1 | Low | Low | Coordinate token usage |

## Security Considerations
- Ensure PROD badge is prominent to prevent accidental modifications
- Consider read-only mode indicator for production connections

## Next Steps
After completion:
- Phase 4 (Tabs) can use connection colors for tab styling
- Phase 8 (Polish) will audit accessibility
