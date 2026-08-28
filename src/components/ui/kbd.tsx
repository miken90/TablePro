import type { ReactNode } from "react";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** Canonical `kbd` (design-spec 5.16, AUDIT consistency #7). No background — the border alone reads as a key cap at this size. */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={[
        "rounded-xs border border-border px-xs font-mono text-ui-2xs text-text-secondary",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </kbd>
  );
}
