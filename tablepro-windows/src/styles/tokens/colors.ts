/** Color primitives + semantic tokens for TablePro design system */

export const primitives = {
  // Zinc scale
  zinc: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b',
  },
  // Blue scale
  blue: {
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
  },
  // Green scale
  green: {
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
  },
  // Yellow scale
  yellow: {
    400: '#facc15',
    500: '#eab308',
    600: '#ca8a04',
  },
  // Red scale
  red: {
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
  },
  // Orange scale
  orange: {
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
  },
  // Indigo scale
  indigo: {
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
  },
} as const;

/** Semantic colors — dark mode default (matches :root in globals.css) */
export const semantic = {
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
    orange: '#fb923c',
    indigo: '#818cf8',
  },
  env: {
    prod: '#f85149',
    staging: '#d29922',
    dev: '#3fb950',
    local: '#58a6ff',
  },
} as const;

/** Semantic colors — light mode overrides */
export const semanticLight = {
  bg: {
    base: '#ffffff',
    surface: '#f6f8fa',
    elevated: '#ffffff',
    muted: '#f0f2f5',
  },
  text: {
    primary: '#1f2328',
    secondary: '#656d76',
    muted: '#8c959f',
  },
  border: {
    subtle: '#d8dee4',
    default: '#c8d0d8',
  },
  accent: {
    blue: '#0969da',
    green: '#1a7f37',
    yellow: '#9a6700',
    red: '#d1242f',
    orange: '#bc4c00',
    indigo: '#4f46e5',
  },
  env: {
    prod: '#d1242f',
    staging: '#9a6700',
    dev: '#1a7f37',
    local: '#0969da',
  },
} as const;

export const colors = { primitives, semantic, semanticLight };
