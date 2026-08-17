/** Spacing tokens — 4px base unit scale for TablePro design system */

export const spacing = {
  // Base 4px unit scale
  px:    '1px',
  0:     '0px',
  0.5:   '2px',
  1:     '4px',
  1.5:   '6px',
  2:     '8px',
  2.5:   '10px',
  3:     '12px',
  3.5:   '14px',
  4:     '16px',
  4.5:   '18px',   // extra — 18px
  5:     '20px',
  6:     '24px',
  7:     '28px',
  8:     '32px',
  9:     '36px',
  10:    '40px',
  11:    '44px',
  12:    '48px',
  13:    '52px',   // extra — 52px
  14:    '56px',
  16:    '64px',
  20:    '80px',
  24:    '96px',
  32:    '128px',
  40:    '160px',
  48:    '192px',
  56:    '224px',
  64:    '256px',
} as const;

/** Component-specific size constants */
export const componentSizes = {
  toolbarHeight:   '36px',  // h-9
  sidebarDefault:  '240px',
  sidebarMin:      '160px',
  sidebarMax:      '480px',
  inspectorDefault:'300px',
  rowHeight:       '28px',
  headerHeight:    '28px',
  tabHeight:       '32px',
} as const;

export const spacingTokens = { spacing, componentSizes };
