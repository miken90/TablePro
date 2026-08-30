/**
 * Esc closes the dock, and the dock is the LAST claimant of the key
 * (§6.3: popover → palette → dialog → dock). Two things make that ordering
 * real rather than assumed:
 *
 * 1. A higher layer that is actually open has already claimed the event via
 *    its own focus-trapped Esc handler, which calls `preventDefault` and
 *    `stopPropagation` before this ever sees it. [RT-9]
 * 2. Focus must be inside the dock. This listener sits on `window` next to
 *    the global shortcut dispatcher, and it registers first — `RightDock`
 *    is a child of `MainLayout`, whose effects run after its children's. A
 *    dock that claimed every Escape would `preventDefault` the key before
 *    the dispatcher ran, and the dispatcher bails on `defaultPrevented`, so
 *    `editor.cancel` (Cancel Query, also bound to Escape) would never fire.
 *    Escape aimed anywhere else falls through untouched.
 *
 * Exported so the claim decision can be exercised directly in tests, the way
 * `createShortcutHandler` is. Returns whether it claimed the event.
 */
export function createDockEscapeHandler(
  container: () => HTMLElement | null,
  close: () => void,
): (e: KeyboardEvent) => boolean {
  return (e: KeyboardEvent): boolean => {
    if (e.key !== "Escape" || e.defaultPrevented) return false;
    const el = container();
    if (!el || !el.contains(document.activeElement)) return false;
    e.preventDefault();
    close();
    return true;
  };
}
