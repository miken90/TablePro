/** Typography tokens for TablePro design system */

export const fontFamily = {
  sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Cascadia Code', 'ui-monospace', 'monospace'],
  system: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
} as const;

export const fontSize = {
  '2xs': ['10px', { lineHeight: '14px' }],
  xs:   ['11px', { lineHeight: '16px' }],
  sm:   ['12px', { lineHeight: '18px' }],
  base: ['13px', { lineHeight: '20px' }],
  md:   ['14px', { lineHeight: '20px' }],
  lg:   ['15px', { lineHeight: '22px' }],
  xl:   ['16px', { lineHeight: '24px' }],
  '2xl':['18px', { lineHeight: '28px' }],
} as const;

export const fontWeight = {
  normal:   '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
} as const;

export const letterSpacing = {
  tight:  '-0.01em',
  normal: '0em',
  wide:   '0.02em',
  wider:  '0.05em',
} as const;

export const typography = { fontFamily, fontSize, fontWeight, letterSpacing };
