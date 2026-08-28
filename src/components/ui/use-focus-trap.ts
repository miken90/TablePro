import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseFocusTrapOptions {
  /** Whether the trap is currently engaged (the surface is open). */
  active: boolean;
  /** Called when the trap's own Esc handler fires. */
  onEscape?: () => void;
  /** Explicit initial-focus target; falls back to the first focusable child. */
  initialFocusRef?: RefObject<HTMLElement>;
}

/**
 * Traps Tab within `containerRef`, closes on Esc, and returns focus to
 * whatever had it when the trap engaged. Dialog and Popover both consume
 * this (design-spec 5.16).
 *
 * The keydown listener is attached directly to the container element, not
 * `window`/`document` — so Esc/Tab are handled and stopped right there,
 * while every other key (including F12) keeps bubbling normally past the
 * container to `document`'s devtools lockout (main.tsx) unaffected. [RT-9]
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  { active, onEscape, initialFocusRef }: UseFocusTrapOptions,
) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement as HTMLElement | null;

    const toFocus =
      initialFocusRef?.current ??
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      null;
    toFocus?.focus();

    return () => {
      triggerRef.current?.focus();
    };
  }, [active, initialFocusRef, containerRef]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(
        container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      e.preventDefault();
      e.stopPropagation();

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const index = current ? focusable.indexOf(current) : -1;

      if (e.shiftKey) {
        (index <= 0 ? last : focusable[index - 1]).focus();
      } else {
        (index === -1 || index === focusable.length - 1 ? first : focusable[index + 1]).focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [active, onEscape, containerRef]);
}
