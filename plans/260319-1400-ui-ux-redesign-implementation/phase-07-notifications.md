# Phase 7: Notifications & Feedback

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P2
- **Status:** Completed ✅
- **Effort:** 6h
- **Parallel:** Yes (with Phase 4)

Implement toast notification system for async operations, errors, and success feedback.

## Key Insights
- No toast system currently exists
- Errors show inline or in console
- Query status shown below editor but easy to miss
- `sonner` is lightweight (5KB) and well-designed

## Requirements

### Functional
- [ ] Toast notifications for: query success, query error, save success, connection events
- [ ] Action buttons in toasts (Undo, View Details)
- [ ] Toast queue with stacking
- [ ] Dismiss on click or timeout
- [ ] Persistent error toasts (no auto-dismiss)

### Non-Functional
- [ ] Toast appearance <50ms
- [ ] Max 3 visible toasts
- [ ] Respects prefers-reduced-motion
- [ ] Design tokens from Phase 1

## Architecture

### Toast Types
```typescript
type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface ToastOptions {
  title: string;
  description?: string;
  type: ToastType;
  duration?: number;    // ms, default 4000
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

### Integration Points
```typescript
// Query execution → success toast
queryStore.execute().then(() => {
  toast.success('Query executed', { description: '1,234 rows returned in 0.3s' });
});

// Save changes → success/error toast
changeStore.saveChanges().then(
  () => toast.success('Changes saved'),
  (err) => toast.error('Save failed', { description: err.message })
);

// Connection events
connectionStore.connect().then(
  () => toast.success('Connected to database'),
  (err) => toast.error('Connection failed', { description: err.message })
);
```

## Related Code Files

### Modify
- `tablepro-windows/src/App.tsx` — Add toast provider
- `tablepro-windows/src/stores/queryStore.ts` — Add toast calls
- `tablepro-windows/src/stores/connectionStore.ts` — Add toast calls
- `tablepro-windows/src/stores/changeStore.ts` — Add toast calls
- `tablepro-windows/package.json` — Add sonner

### Create
- `tablepro-windows/src/components/shared/toast-provider.tsx`
- `tablepro-windows/src/hooks/useToast.ts`

## Implementation Steps

### Step 1: Install Sonner (0.5h)
```bash
powershell.exe -Command "cd tablepro-windows; npm install sonner"
```

### Step 2: Create Toast Provider (1h)
```tsx
// toast-provider.tsx
import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: 'bg-surface-elevated border-border text-primary',
        duration: 4000,
      }}
      visibleToasts={3}
      closeButton
    />
  );
}
```

### Step 3: Create Toast Hook (1h)
```typescript
// useToast.ts
import { toast as sonnerToast } from 'sonner';

export function useToast() {
  return {
    success: (title: string, opts?: Partial<ToastOptions>) => 
      sonnerToast.success(title, { description: opts?.description, ...opts }),
    error: (title: string, opts?: Partial<ToastOptions>) =>
      sonnerToast.error(title, { description: opts?.description, duration: Infinity, ...opts }),
    warning: (title: string, opts?: Partial<ToastOptions>) =>
      sonnerToast.warning(title, opts),
    info: (title: string, opts?: Partial<ToastOptions>) =>
      sonnerToast.info(title, opts),
    loading: (title: string, opts?: Partial<ToastOptions>) =>
      sonnerToast.loading(title, opts),
    dismiss: (id?: string) => sonnerToast.dismiss(id),
  };
}
```

### Step 4: Integrate into Query Store (1h)
```typescript
// queryStore.ts
import { toast } from 'sonner';

execute: async (sessionId, sql) => {
  const loadingId = toast.loading('Executing query...');
  try {
    const result = await invokeExecuteQuery(sessionId, sql);
    toast.dismiss(loadingId);
    toast.success('Query executed', {
      description: `${result.rows.length} rows in ${result.executionTime}ms`,
    });
    return result;
  } catch (err) {
    toast.dismiss(loadingId);
    toast.error('Query failed', { description: err.message });
    throw err;
  }
}
```

### Step 5: Integrate into Connection/Change Stores (1.5h)
- Connection success/failure toasts
- Save changes success/failure toasts
- Disconnect notifications

### Step 6: Style with Design Tokens (1h)
- Custom toast component styling if needed
- Ensure dark mode compatibility
- Add icons for each toast type

## Todo List
- [x] Install `sonner` package
- [x] Create `ToastProvider` component
- [x] Add `ToastProvider` to App.tsx
- [x] Create `useToast` hook
- [x] Add toasts to `queryStore.execute`
- [x] Add toasts to `connectionStore.connect/disconnect`
- [x] Add toasts to `changeStore.saveChanges`
- [x] Style toasts with design tokens
- [x] Test toast stacking behavior
- [x] Verify error toasts don't auto-dismiss
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] Query success shows row count toast
- [x] Query error shows error message toast
- [x] Connection events show appropriate toasts
- [x] Save success/failure shows toast
- [x] Error toasts persist until dismissed
- [x] Max 3 toasts visible at once

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Toast spam on rapid actions | Medium | Low | Debounce certain toasts |
| Z-index conflicts | Low | Low | Use highest z-index layer |

## Security Considerations
- Sanitize error messages before displaying
- Don't expose sensitive connection details in toasts

## Next Steps
After completion:
- Phase 8 will audit toast accessibility
