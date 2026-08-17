/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Semantic surface colors (CSS variable–driven) ──
        surface: {
          DEFAULT: 'var(--color-bg-surface)',
          elevated: 'var(--color-bg-elevated)',
          muted: 'var(--color-bg-muted)',
          base: 'var(--color-bg-base)',
          hover: 'var(--color-bg-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
        },
        // ── Text colors ──
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted':     'var(--color-text-muted)',
        // ── Accent colors ──
        accent: {
          blue:   'var(--color-accent-blue)',
          green:  'var(--color-accent-green)',
          yellow: 'var(--color-accent-yellow)',
          red:    'var(--color-accent-red)',
          orange: 'var(--color-accent-orange)',
          indigo: 'var(--color-accent-indigo)',
        },
        // ── Environment tag colors ──
        env: {
          prod:    'var(--color-env-prod)',
          staging: 'var(--color-env-staging)',
          dev:     'var(--color-env-dev)',
          local:   'var(--color-env-local)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Cascadia Code', 'ui-monospace', 'monospace'],
      },
      spacing: {
        '4.5': '1.125rem',  // 18px
        '13':  '3.25rem',   // 52px
      },
      boxShadow: {
        sm:    'var(--shadow-sm)',
        base:  'var(--shadow-base)',
        panel: 'var(--shadow-panel)',
        modal: 'var(--shadow-modal)',
        popup: 'var(--shadow-popup)',
      },
      transitionDuration: {
        fast:     '100ms',
        normal:   '150ms',
        moderate: '200ms',
        slow:     '300ms',
      },
      transitionTimingFunction: {
        spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
        snappy:  'cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOut: {
          from: { opacity: '1', transform: 'translateY(0)' },
          to:   { opacity: '0', transform: 'translateY(-4px)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in':    'fadeIn 150ms cubic-bezier(0, 0, 0.2, 1)',
        'fade-out':   'fadeOut 150ms cubic-bezier(0.4, 0, 1, 1)',
        'slide-down': 'slideDown 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-up':   'slideUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        shimmer:      'shimmer 1.5s linear infinite',
      },
    },
  },
  plugins: [],
};
