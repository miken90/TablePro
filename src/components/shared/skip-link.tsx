/** SkipLink — hidden until focused; lets keyboard users jump to main content */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:rounded focus:bg-surface-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-text-primary focus:shadow-md"
    >
      Skip to main content
    </a>
  );
}
