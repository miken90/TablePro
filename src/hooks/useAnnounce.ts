import { useCallback } from "react";

/**
 * Returns an `announce` function that posts messages to the hidden
 * `#sr-announcer` live region so screen readers narrate dynamic changes.
 *
 * Usage:
 *   const { announce } = useAnnounce();
 *   announce("Query completed, 42 rows returned");
 *   announce("Connected to production", "assertive");
 */
export function useAnnounce() {
  const announce = useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    const el = document.getElementById("sr-announcer");
    if (!el) return;
    // Reset first so repeated identical messages still trigger the reader
    el.textContent = "";
    el.setAttribute("aria-live", priority);
    // Defer slightly so the DOM mutation is detected
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }, []);

  return { announce };
}
