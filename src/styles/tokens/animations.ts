/** Animation tokens — durations and easings for TablePro design system */

export const duration = {
  instant:  '0ms',
  fast:     '100ms',
  normal:   '150ms',
  moderate: '200ms',
  slow:     '300ms',
  slower:   '400ms',
  lazy:     '500ms',
} as const;

export const easing = {
  linear:    'linear',
  easeIn:    'cubic-bezier(0.4, 0, 1, 1)',
  easeOut:   'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring:    'cubic-bezier(0.34, 1.56, 0.64, 1)',
  snappy:    'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/** Predefined transition presets for common interactions */
export const transition = {
  colors:    `color ${duration.normal} ${easing.easeInOut}, background-color ${duration.normal} ${easing.easeInOut}, border-color ${duration.normal} ${easing.easeInOut}`,
  opacity:   `opacity ${duration.normal} ${easing.easeInOut}`,
  transform: `transform ${duration.normal} ${easing.easeOut}`,
  fadeIn:    `opacity ${duration.fast} ${easing.easeOut}, transform ${duration.fast} ${easing.easeOut}`,
  slideIn:   `transform ${duration.moderate} ${easing.spring}`,
  all:       `all ${duration.normal} ${easing.easeInOut}`,
} as const;

/** Keyframe animation names (must match CSS @keyframes definitions) */
export const keyframes = {
  fadeIn:     'fadeIn',
  fadeOut:    'fadeOut',
  slideDown:  'slideDown',
  slideUp:    'slideUp',
  pulse:      'pulse',
  spin:       'spin',
  shimmer:    'shimmer',
} as const;

export const animations = { duration, easing, transition, keyframes };
