# Phase 3: Command Palette

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P1
- **Status:** Completed ✅
- **Effort:** 12h
- **Parallel:** No (depends on Phase 1)

Implement VS Code-style command palette with `Cmd/Ctrl+Shift+P` for all app actions. Extend existing quick switcher pattern.

## Key Insights
- Quick switcher exists at `Ctrl+K` for tables/schemas
- No centralized action registry
- Keyboard shortcuts scattered across `useEffect` handlers
- `cmdk` library is ideal (MIT, same as VS Code uses internally)

## Requirements

### Functional
- [ ] Open with `Cmd/Ctrl+Shift+P`
- [ ] Fuzzy search all commands
- [ ] Show keyboard shortcut hints
- [ ] Group commands by category
- [ ] Recent commands at top
- [ ] Execute actions from palette

### Non-Functional
- [ ] Open in <100ms
- [ ] Search responsive at 60fps
- [ ] Design tokens from Phase 1

## Architecture

### Command Registry
```typescript
// hooks/useCommandRegistry.ts
interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: 'Navigation' | 'Query' | 'Edit' | 'View' | 'Settings';
  action: () => void;
  when?: () => boolean; // Conditional availability
}

const commands: Command[] = [
  { id: 'query.run', label: 'Run Query', shortcut: '⌘↵', category: 'Query', action: ... },
  { id: 'view.toggleSidebar', label: 'Toggle Sidebar', shortcut: '⌘B', category: 'View', action: ... },
  // ...
];
```

### Component Structure
```
components/shared/
├── command-palette/
│   ├── command-palette.tsx    # Main component using cmdk
│   ├── command-item.tsx       # Individual command row
│   ├── command-group.tsx      # Category grouping
│   └── index.ts
```

## Related Code Files

### Modify
- `tablepro-windows/src/components/layout/MainLayout.tsx` — Add palette trigger
- `tablepro-windows/package.json` — Add cmdk dependency

### Create
- `tablepro-windows/src/components/shared/command-palette/command-palette.tsx`
- `tablepro-windows/src/components/shared/command-palette/command-item.tsx`
- `tablepro-windows/src/components/shared/command-palette/index.ts`
- `tablepro-windows/src/hooks/useCommandRegistry.ts`

## Implementation Steps

### Step 1: Install Dependencies (0.5h)
```bash
powershell.exe -Command "cd tablepro-windows; npm install cmdk"
```

### Step 2: Create Command Registry Hook (3h)
```typescript
// useCommandRegistry.ts
import { create } from 'zustand';

interface CommandStore {
  commands: Command[];
  recentCommandIds: string[];
  registerCommand: (cmd: Command) => void;
  executeCommand: (id: string) => void;
  getFilteredCommands: (query: string) => Command[];
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  commands: [],
  recentCommandIds: [],
  registerCommand: (cmd) => set(s => ({ commands: [...s.commands, cmd] })),
  executeCommand: (id) => {
    const cmd = get().commands.find(c => c.id === id);
    if (cmd && (!cmd.when || cmd.when())) {
      cmd.action();
      set(s => ({
        recentCommandIds: [id, ...s.recentCommandIds.filter(i => i !== id)].slice(0, 5)
      }));
    }
  },
  getFilteredCommands: (query) => {
    const q = query.toLowerCase();
    return get().commands
      .filter(c => c.label.toLowerCase().includes(q) || c.id.includes(q))
      .filter(c => !c.when || c.when());
  },
}));
```

### Step 3: Create Command Palette Component (4h)
```tsx
// command-palette.tsx
import { Command } from 'cmdk';

export function CommandPalette({ open, onOpenChange }) {
  const { getFilteredCommands, executeCommand, recentCommandIds } = useCommandStore();
  const [query, setQuery] = useState('');
  
  const filtered = getFilteredCommands(query);
  const grouped = groupBy(filtered, 'category');
  
  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange}>
      <Command.Input 
        placeholder="Type a command..."
        value={query}
        onValueChange={setQuery}
      />
      <Command.List>
        {recentCommandIds.length > 0 && query === '' && (
          <Command.Group heading="Recent">
            {recentCommandIds.map(id => (
              <CommandItem key={id} commandId={id} />
            ))}
          </Command.Group>
        )}
        {Object.entries(grouped).map(([category, cmds]) => (
          <Command.Group key={category} heading={category}>
            {cmds.map(cmd => (
              <CommandItem key={cmd.id} command={cmd} />
            ))}
          </Command.Group>
        ))}
        <Command.Empty>No commands found.</Command.Empty>
      </Command.List>
    </Command.Dialog>
  );
}
```

### Step 4: Register Core Commands (2h)
Register commands in MainLayout or dedicated provider:
- Navigation: Open Settings, Toggle Sidebar, Toggle History, Quick Switcher
- Query: Run Query, Run All, Cancel Query, Format SQL
- Edit: New Tab, Close Tab, Save Changes, Undo, Redo
- View: Toggle Filter, Toggle Inspector, Focus Mode

### Step 5: Integrate into MainLayout (1.5h)
- Add keyboard listener for `Cmd/Ctrl+Shift+P`
- Render `<CommandPalette />` component
- Connect to existing action handlers

### Step 6: Style with Design Tokens (1h)
- Use semantic colors from Phase 1
- Match quick switcher styling
- Add smooth open/close animation

## Todo List
- [x] Install `cmdk` package
- [x] Create `useCommandStore` with registry pattern
- [x] Create `CommandPalette` component with cmdk
- [x] Create `CommandItem` component with shortcut display
- [x] Register navigation commands
- [x] Register query commands
- [x] Register edit commands
- [x] Register view commands
- [x] Add `Cmd/Ctrl+Shift+P` keyboard handler
- [x] Integrate into MainLayout
- [x] Style with design tokens
- [x] Test all registered commands execute correctly
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] `Cmd/Ctrl+Shift+P` opens command palette
- [x] Fuzzy search works across all commands
- [x] Recent commands shown at top (when no query)
- [x] Shortcuts displayed in command items
- [x] All registered commands execute correctly
- [x] Escape closes palette

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Shortcut conflicts | Medium | Medium | Audit existing handlers first |
| cmdk styling conflicts | Low | Low | Use unstyled mode + custom CSS |
| Bundle size increase | Low | Low | cmdk is only ~14KB |

## Security Considerations
None — UI component only.

## Next Steps
After completion:
- Add more commands as features are built
- Phase 8 will audit keyboard accessibility
