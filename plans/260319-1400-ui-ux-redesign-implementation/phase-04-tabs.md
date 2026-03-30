# Phase 4: Tab System Improvements

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P2
- **Status:** Completed ✅
- **Effort:** 8h
- **Parallel:** Yes (with Phase 3)

Enhance tab visual identity with connection colors, icons, and preview tab support.

## Key Insights
- `EditorTabBar.tsx` exists with basic tabs
- `editorStore.ts` tracks tabs with `isPreview` flag
- Preview tab support partially implemented
- No tab coloring by connection
- No tab icons (query vs table)

## Requirements

### Functional
- [ ] Tab border/indicator inherits connection color
- [ ] Tab icons: query (code), table (grid), structure (schema)
- [ ] Preview tabs with italic title
- [ ] Pin tabs (pinned stay left)
- [ ] Tab hover shows content preview
- [ ] Tab context menu (close, close others, close all)

### Non-Functional
- [ ] Tab overflow scrolling when many tabs
- [ ] Smooth tab reorder animation
- [ ] Design tokens from Phase 1

## Architecture

### Tab Model Extension
```typescript
// editorStore.ts
interface Tab {
  id: string;
  title: string;
  content: string;
  isPreview: boolean;
  isPinned: boolean;           // NEW
  connectionId?: string;       // NEW - for color inheritance
  type: 'query' | 'table' | 'structure'; // NEW
}
```

### Tab Component Structure
```tsx
// EditorTab.tsx
<div className={cn(
  "group relative flex items-center gap-1.5 px-3 py-1.5",
  isActive && "bg-surface-elevated",
  isPreview && "italic"
)}>
  <TabIcon type={tab.type} />
  <span className="truncate max-w-[120px]">{tab.title}</span>
  {!isPinned && (
    <button className="opacity-0 group-hover:opacity-100" onClick={onClose}>
      <X size={12} />
    </button>
  )}
  {/* Connection color indicator */}
  {connectionColor && (
    <div 
      className="absolute bottom-0 left-0 right-0 h-0.5" 
      style={{ backgroundColor: connectionColor }}
    />
  )}
</div>
```

## Related Code Files

### Modify
- `tablepro-windows/src/components/editor/EditorTabBar.tsx` — Main tab bar
- `tablepro-windows/src/stores/editorStore.ts` — Tab model

### Create
- `tablepro-windows/src/components/editor/EditorTab.tsx` — Individual tab
- `tablepro-windows/src/components/editor/TabIcon.tsx` — Type icons
- `tablepro-windows/src/components/editor/TabContextMenu.tsx` — Right-click menu

## Implementation Steps

### Step 1: Extend Tab Model (1h)
```typescript
// editorStore.ts additions
interface Tab {
  // existing fields...
  isPinned: boolean;
  connectionId?: string;
  type: 'query' | 'table' | 'structure';
}

// Add actions
pinTab: (id: string) => void;
unpinTab: (id: string) => void;
setTabConnection: (id: string, connectionId: string) => void;
```

### Step 2: Create TabIcon Component (1h)
```tsx
// TabIcon.tsx
import { Code, Table2, Boxes } from 'lucide-react';

const icons = {
  query: Code,
  table: Table2,
  structure: Boxes,
};

export function TabIcon({ type }: { type: Tab['type'] }) {
  const Icon = icons[type] || Code;
  return <Icon size={14} className="text-muted shrink-0" />;
}
```

### Step 3: Create EditorTab Component (2h)
- Extract tab rendering from EditorTabBar
- Add connection color indicator (bottom border)
- Handle preview vs regular styling
- Handle pinned vs unpinned
- Add hover state with content preview tooltip

### Step 4: Create Tab Context Menu (1.5h)
```tsx
// TabContextMenu.tsx
export function TabContextMenu({ tab, position, onClose }) {
  return (
    <div style={{ top: position.y, left: position.x }}>
      <MenuItem onClick={() => pinTab(tab.id)}>
        {tab.isPinned ? 'Unpin Tab' : 'Pin Tab'}
      </MenuItem>
      <MenuItem onClick={() => closeTab(tab.id)}>Close</MenuItem>
      <MenuItem onClick={closeOtherTabs}>Close Others</MenuItem>
      <MenuItem onClick={closeAllTabs}>Close All</MenuItem>
      <Separator />
      <MenuItem onClick={closeTabsToRight}>Close to the Right</MenuItem>
    </div>
  );
}
```

### Step 5: Update EditorTabBar (2h)
- Use new EditorTab component
- Sort tabs: pinned first, then by order
- Add horizontal scroll for overflow
- Add context menu on right-click
- Wire up connection color from connectionStore

### Step 6: Polish Animations (0.5h)
- Tab add/remove transitions
- Smooth scroll to active tab
- Hover preview fade-in

## Todo List
- [x] Add `isPinned`, `connectionId`, `type` to Tab interface
- [x] Add `pinTab`, `unpinTab` actions to editorStore
- [x] Create `TabIcon.tsx` component
- [x] Create `EditorTab.tsx` component with all features
- [x] Create `TabContextMenu.tsx` component
- [x] Update `EditorTabBar.tsx` to use new components
- [x] Add tab overflow scrolling
- [x] Wire up connection colors from connectionStore
- [x] Add right-click context menu handler
- [x] Style preview tabs with italic
- [x] Style pinned tabs (no close button)
- [x] Test tab persistence (Zustand persist)
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] Tabs show connection color indicator
- [x] Tab icons distinguish query/table/structure
- [x] Preview tabs display in italic
- [x] Pinned tabs stay left, no close button
- [x] Context menu works with all actions
- [x] Tab overflow scrolls smoothly

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| State migration breaks existing tabs | Medium | High | Add migration logic in store |
| Context menu position off-screen | Low | Low | Bound to viewport |

## Security Considerations
None — UI component only.

## Next Steps
After completion:
- Phase 8 will audit tab keyboard navigation
