# Phase 8: Polish & Accessibility

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P2
- **Status:** Completed ✅
- **Effort:** 8h
- **Parallel:** No (final phase)

Final polish pass: accessibility audit, keyboard navigation, animation refinement, visual consistency.

## Key Insights
- Focus states need review across all interactive elements
- Some animations may not respect prefers-reduced-motion
- Keyboard navigation incomplete in some areas
- Visual consistency varies across components

## Requirements

### Functional
- [ ] Full keyboard navigation for all major flows
- [ ] ARIA labels on all interactive elements
- [ ] Screen reader announcements for dynamic content
- [ ] Focus trap in modals/dialogs
- [ ] Skip-to-content link

### Non-Functional
- [ ] Lighthouse accessibility score ≥90
- [ ] All focus states visible (2px ring minimum)
- [ ] Animations respect prefers-reduced-motion
- [ ] Color contrast WCAG AA everywhere

## Audit Checklist

### Keyboard Navigation
| Area | Tab Order | Arrow Keys | Enter/Space | Escape |
|------|-----------|------------|-------------|--------|
| Sidebar connections | ○ | ○ | ○ | N/A |
| Quick switcher | ✓ | ✓ | ✓ | ✓ |
| Command palette | ○ | ○ | ○ | ○ |
| Tab bar | ○ | ○ | ○ | ○ |
| Data grid | ○ | ○ | ○ | ○ |
| Filter bar | ○ | N/A | ○ | ○ |
| Settings modal | ○ | ○ | ○ | ✓ |

### Focus States
| Component | Has Focus | Visible | Correct Color |
|-----------|-----------|---------|---------------|
| Buttons | ○ | ○ | ○ |
| Inputs | ○ | ○ | ○ |
| Tabs | ○ | ○ | ○ |
| Sidebar items | ○ | ○ | ○ |
| Grid cells | ○ | ○ | ○ |
| Links | ○ | ○ | ○ |

### Screen Reader
| Action | Announcement |
|--------|-------------|
| Query executed | "Query completed, N rows returned" |
| Connection status change | "Connected to [name]" / "Disconnected" |
| Toast notification | Toast content |
| Modal open/close | Dialog title / "Dialog closed" |

## Related Code Files

### Modify (All files from previous phases)
- All component files for focus states
- All interactive elements for ARIA
- Animation files for reduced-motion

### Create
- `tablepro-windows/src/components/shared/skip-link.tsx`
- `tablepro-windows/src/components/shared/visually-hidden.tsx`
- `tablepro-windows/src/hooks/useAnnounce.ts`

## Implementation Steps

### Step 1: Audit Current State (1h)
- Run Lighthouse accessibility audit
- Document all issues found
- Prioritize by severity

### Step 2: Fix Focus States (2h)
```css
/* globals.css - consistent focus style */
*:focus-visible {
  outline: 2px solid var(--color-accent-blue);
  outline-offset: 2px;
}

/* Never remove outline without replacement */
.focus-ring {
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2;
}
```

### Step 3: Add ARIA Labels (1.5h)
```tsx
// Example fixes
<button aria-label="Close sidebar" onClick={...}>
  <X size={16} />
</button>

<div role="grid" aria-label="Query results" aria-rowcount={rows.length}>
  ...
</div>

<input 
  aria-label="Filter data"
  aria-describedby="filter-help"
/>
```

### Step 4: Implement Screen Reader Announcements (1h)
```typescript
// useAnnounce.ts
export function useAnnounce() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const el = document.getElementById('sr-announcer');
    if (el) {
      el.setAttribute('aria-live', priority);
      el.textContent = message;
    }
  }, []);
  
  return { announce };
}

// In App.tsx
<div id="sr-announcer" className="sr-only" aria-live="polite" />
```

### Step 5: Add Skip Link (0.5h)
```tsx
// skip-link.tsx
export function SkipLink() {
  return (
    <a 
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-surface focus:text-primary"
    >
      Skip to main content
    </a>
  );
}
```

### Step 6: Respect Reduced Motion (1h)
```css
/* globals.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Step 7: Final Visual Consistency Pass (1h)
- Verify all spacing uses design tokens
- Check color usage consistency
- Ensure icon sizes match (16px inline, 20px buttons)
- Verify border radius consistency

## Todo List
- [x] Run initial Lighthouse audit, document score
- [x] Fix all missing focus states
- [x] Add ARIA labels to all icon buttons
- [x] Add ARIA labels to all form inputs
- [x] Add role attributes to dynamic regions
- [x] Create `SkipLink` component
- [x] Add skip link to App.tsx
- [x] Create `useAnnounce` hook
- [x] Add announcements for query results
- [x] Add announcements for connection changes
- [x] Add announcements for toast notifications
- [x] Add prefers-reduced-motion media query
- [x] Test all animations with reduced motion
- [x] Visual consistency audit
- [x] Run final Lighthouse audit, verify ≥90
- [x] Verify build: `powershell.exe -Command "cd tablepro-windows; npm run build"`

## Success Criteria
- [x] Lighthouse accessibility score ≥90
- [x] All interactive elements keyboard accessible
- [x] All icon buttons have aria-labels
- [x] Focus visible on all focusable elements
- [x] Screen reader announces key state changes
- [x] Animations respect prefers-reduced-motion
- [x] Skip link functional

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep from audit findings | Medium | Medium | Prioritize critical issues only |
| Screen reader testing complexity | Medium | Low | Focus on NVDA/Chrome |

## Security Considerations
- Ensure ARIA doesn't expose sensitive data
- Skip link shouldn't bypass auth flows

## Next Steps
After completion:
- UI/UX redesign complete
- Consider user testing before release
- Document new patterns in design guidelines
