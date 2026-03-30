/** Shadow/elevation tokens for TablePro design system */

/** Dark mode shadow values (default) */
export const shadowsDark = {
  none:   'none',
  sm:     '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
  base:   '0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.4)',
  md:     '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.4)',
  lg:     '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
  xl:     '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
  '2xl':  '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
  // App-specific
  panel:  '0 4px 16px rgba(0, 0, 0, 0.6)',
  modal:  '0 8px 32px rgba(0, 0, 0, 0.7)',
  popup:  '0 2px 8px rgba(0, 0, 0, 0.5)',
  inset:  'inset 0 1px 2px rgba(0, 0, 0, 0.4)',
} as const;

/** Light mode shadow values */
export const shadowsLight = {
  none:   'none',
  sm:     '0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  base:   '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
  md:     '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
  lg:     '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
  xl:     '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  '2xl':  '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  panel:  '0 4px 16px rgba(0, 0, 0, 0.12)',
  modal:  '0 8px 32px rgba(0, 0, 0, 0.18)',
  popup:  '0 2px 8px rgba(0, 0, 0, 0.1)',
  inset:  'inset 0 1px 2px rgba(0, 0, 0, 0.08)',
} as const;

/** CSS variable-based shadows for Tailwind (resolves at runtime per theme) */
export const shadows = {
  none:   'none',
  sm:     'var(--shadow-sm)',
  base:   'var(--shadow-base)',
  md:     'var(--shadow-md)',
  lg:     'var(--shadow-lg)',
  xl:     'var(--shadow-xl)',
  '2xl':  'var(--shadow-2xl)',
  panel:  'var(--shadow-panel)',
  modal:  'var(--shadow-modal)',
  popup:  'var(--shadow-popup)',
  inset:  'var(--shadow-inset)',
} as const;

export const shadowTokens = { shadowsDark, shadowsLight, shadows };
