# Phase 1: Design System Foundation

## Context Links
- [Brainstorm Report](../reports/brainstorm-260319-tablepro-windows-ui-ux-redesign.md)
- [Plan Overview](./plan.md)

## Overview
- **Priority:** P1 (Critical Path)
- **Status:** Completed ✅
- **Effort:** 12h
- **Parallel:** Yes (with Phase 2)

Establish comprehensive design token system with Tailwind configuration. Foundation for all subsequent UI work.

## Key Insights
- Current `tailwind.config.js` has zero customization
- CSS variables exist in `globals.css` but inconsistent
- Typography stack uses system fonts (good), but no scale defined
- Dark mode works but colors are hardcoded per-component

## Requirements

### Functional
- [ ] Design tokens for colors, spacing, typography, shadows, animations
- [ ] Tailwind config extended with semantic tokens
- [ ] CSS custom properties for runtime theming
- [ ] Light/dark mode color palettes

### Non-Functional
- [ ] WCAG AA contrast ratios (4.5:1 text, 3:1 UI)
- [ ] No visual regression from token migration
- [ ] Build size increase <5KB

## Architecture

### Token Structure
```
src/styles/
├── tokens/
│   ├── colors.ts      # Color primitives + semantic
│   ├── typography.ts  # Font stacks, sizes, weights
│   ├── spacing.ts     # 4px base unit scale
│   ├── shadows.ts     # Elevation levels
│   └── animations.ts  # Durations, easings
├── themes/
│   ├── light.css      # Light mode overrides
│   └── dark.css       # Dark mode (default)
└── globals.css        # Import all, CSS custom props
```

### Tailwind Integration
```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        border: 'var(--color-border)',
        // ... semantic tokens
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      spacing: {
        '4.5': '1.125rem', // 18px
        '13': '3.25rem',   // 52px
      },
    },
  },
}
```

## Related Code Files

### Modify
- `tablepro-windows/tailwind.config.js` — Extend with tokens
- `tablepro-windows/src/styles/globals.css` — CSS custom properties

### Create
- `tablepro-windows/src/styles/tokens/colors.ts`
- `tablepro-windows/src/styles/tokens/typography.ts`
- `tablepro-windows/src/styles/tokens/spacing.ts`
- `tablepro-windows/src/styles/tokens/shadows.ts`
- `tablepro-windows/src/styles/tokens/animations.ts`
- `tablepro-windows/src/styles/tokens/index.ts`

## Implementation Steps

### Step 1: Create Token Files (2h)
```typescript
// colors.ts
export const colors = {
  // Primitives
  zinc: { 50: '#fafafa', /* ... */ 950: '#09090b' },
  blue: { 500: '#3b82f6', 600: '#2563eb' },
  
  // Semantic (dark mode default)
  bg: {
    base: '#0f1419',
    surface: '#151b23',
    elevated: '#1c2431',
    muted: '#252d3a',
  },
  text: {
    primary: '#e6edf3',
    secondary: '#8b949e',
    muted: '#6e7681',
  },
  border: {
    subtle: '#2d3848',
    default: '#3d4a5c',
  },
  accent: {
    blue: '#58a6ff',
    green: '#3fb950',
    yellow: '#d29922',
    red: '#f85149',
  },
  env: {
    prod: '#f85149',
    staging: '#d29922',
    dev: '#3fb950',
    local: '#58a6ff',
  },
};
```

### Step 2: Update Tailwind Config (2h)
- Import token files
- Extend `colors`, `fontFamily`, `spacing`, `boxShadow`
- Add animation presets

### Step 3: Create CSS Custom Properties (2h)
```css
/* globals.css */
:root {
  --color-bg-base: #0f1419;
  --color-bg-surface: #151b23;
  /* ... all tokens as CSS vars */
}

.light {
  --color-bg-base: #ffffff;
  --color-bg-surface: #f6f8fa;
  /* ... light overrides */
}
```

### Step 4: Migrate Core Components (4h)
Priority components to update:
1. `MainLayout.tsx` — bg, border classes
2. `Sidebar.tsx` — bg, text, border
3. `Toolbar.tsx` — bg, border
4. `DataGrid` components — cell, header colors

### Step 5: Visual Regression Check (2h)
- Screenshot before/after key views
- Verify dark/light mode toggle
- Check contrast ratios with DevTools

## Todo List
- [x] Create `tokens/colors.ts` with primitives and semantic colors
- [x] Create `tokens/typography.ts` with font stacks and scale
- [x] Create `tokens/spacing.ts` with 4px-based scale
- [x] Create `tokens/shadows.ts` with elevation levels
- [x] Create `tokens/animations.ts` with durations and easings
- [x] Update `tailwind.config.js` with token imports
- [x] Update `globals.css` with CSS custom properties
- [x] Add light theme CSS overrides
- [x] Migrate `MainLayout.tsx` to use semantic classes
- [x] Migrate `Sidebar.tsx` to use semantic classes
- [x] Migrate `Toolbar.tsx` to use semantic classes
- [x] Verify build succeeds: `powershell.exe -Command "cd tablepro-windows; npm run build"`
- [x] Visual regression check (manual screenshots)

## Success Criteria
- [x] All token files created and exporting correctly
- [x] Tailwind config extended, build passes
- [x] Dark/light mode toggle works with new tokens
- [x] No visual regressions in core views
- [x] Contrast ratios meet WCAG AA

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Token naming conflicts | Low | Medium | Prefix with `tp-` if needed |
| Build breaks from imports | Medium | High | Test incrementally |
| Visual regressions | Medium | Medium | Screenshot comparison |

## Security Considerations
None — frontend styling only.

## Next Steps
After completion:
- Phase 3 (Command Palette) can begin using tokens
- Phase 5 (Data Grid) can begin using tokens
- Other phases reference design system
