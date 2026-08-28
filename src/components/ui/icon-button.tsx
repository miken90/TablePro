import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** Required — an icon-only control with no accessible name is a bug (design-spec 6.4). */
  "aria-label": string;
  icon: ReactNode;
  /** Toggled/active state — `.iconbtn.on`. */
  active?: boolean;
  className?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, active = false, disabled, className, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      disabled={disabled}
      className={[
        "grid h-[var(--control-h-sm)] w-[var(--control-h-sm)] flex-none place-items-center rounded-sm",
        "transition-colors duration-fast ease-snappy",
        "disabled:opacity-[.45] disabled:cursor-not-allowed",
        active
          ? "bg-surface-muted text-accent-blue"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
    </button>
  );
});
