import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFocusTrap } from "./use-focus-trap";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
  className?: string;
}

/**
 * Anchored below-start of its trigger, flipping above when it would clip
 * the viewport (SCR-25). `role="dialog"` without `aria-modal` — a popover
 * does not capture all keyboard input the way a modal does, so it stays
 * outside the "is the palette modal?" rule (design-spec 5.16, AUDIT M2).
 */
export function Popover({ open, onClose, anchorRef, children, className }: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useFocusTrap(containerRef, { active: open, onEscape: onClose });

  useEffect(() => {
    // No reset-on-close: the component returns null below whenever `!open`,
    // so a stale position is never rendered — it is simply recomputed the
    // next time this effect runs with `open` true.
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverHeight = containerRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const flip = popoverHeight > 0 && spaceBelow < popoverHeight && anchorRect.top > popoverHeight;

    setPosition({
      top: flip ? anchorRect.top - popoverHeight : anchorRect.bottom,
      left: anchorRect.left,
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      style={position ?? undefined}
      className={[
        "fixed z-popover max-w-[var(--w-popover-max)] max-h-[var(--h-popover-max)] overflow-auto",
        "rounded-md border border-border bg-surface-elevated shadow-popup",
        position ? "" : "invisible",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
