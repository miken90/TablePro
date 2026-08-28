import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /**
   * `danger` is the FILLED destructive variant — use it only on the control
   * that actually commits an irreversible write (the confirming button
   * inside a destructive dialog: Drop/Truncate, Bulk Delete, Discard, Drop
   * routine). `danger-ghost` is the text-only variant for a control that
   * only stages or selects a destructive intent — a row/toolbar action that
   * opens a confirm, nothing written yet.
   *
   * The rule a user can learn: a filled red button writes; a red label does
   * not. A control that opens a confirmation dialog is therefore always
   * ghost. Design-spec 5.16, AUDIT M5.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner replaces the leading icon; label stays; control disabled. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-blue-fill text-text-inverse hover:bg-accent-blue-fill-hover active:bg-accent-blue-fill active:shadow-inset",
  secondary:
    "bg-transparent border border-border text-text-primary hover:bg-surface-hover active:bg-surface-muted",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-muted",
  danger:
    "bg-accent-red-fill text-text-inverse hover:bg-accent-red-fill-hover active:bg-accent-red-fill active:shadow-inset",
  "danger-ghost":
    "bg-transparent text-accent-red hover:bg-accent-red-subtle active:bg-accent-red-subtle active:shadow-inset",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-control-xs px-md text-ui-2xs",
  md: "h-control-md px-lg text-ui-sm",
  lg: "h-control-lg px-lg text-ui-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leadingIcon,
    disabled,
    children,
    className,
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center gap-sm rounded-sm font-medium whitespace-nowrap",
        "transition-colors duration-fast ease-snappy",
        "disabled:opacity-[.45] disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : leadingIcon}
      {children}
    </button>
  );
});
