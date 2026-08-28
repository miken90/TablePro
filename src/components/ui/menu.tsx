import { useRef, type ReactNode } from "react";
import { useFocusTrap } from "./use-focus-trap";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/** Canonical context menu (design-spec 5.16): min-width 220, `--shadow-popup`. */
export function Menu({ open, onClose, children, className }: MenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, { active: open, onEscape: onClose });

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="menu"
      className={[
        "min-w-[220px] rounded-md border border-border bg-surface-elevated py-2xs shadow-popup",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  onSelect: () => void;
  /**
   * Ghost-by-construction destructive item — text-only red on a subtle red
   * hover, never filled (design-spec 5.16, AUDIT M5).
   */
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

export function MenuItem({ children, onSelect, danger = false, disabled = false, icon }: MenuItemProps) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={[
        "flex h-control-md w-full items-center gap-sm px-lg text-left text-ui-sm",
        "disabled:opacity-[.45] disabled:cursor-not-allowed",
        danger
          ? "text-accent-red hover:bg-accent-red-subtle"
          : "text-text-primary hover:bg-surface-hover",
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div role="separator" className="my-2xs border-t border-border-subtle" />;
}
