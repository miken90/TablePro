import type { HTMLAttributes, ReactNode } from "react";

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  className?: string;
}

/**
 * The bordered INLINE CONTROL WRAPPER (design-spec 5.16 — keeps the `.field`
 * name, the majority pattern). A box that CONTAINS a control plus its
 * adornments (icon, clear button) — not the label-over-control stack, which
 * is `FormRow` (audit consistency #1: the two were one class, drifting).
 *
 * The inner control must be borderless/transparent (`background:none;
 * border:0`) and must not kill its own focus outline: the ring lives on
 * this wrapper via `focus-within`, because a ring on a bare inner input
 * would draw inside the wrapper's own border. That relocation is the only
 * sanctioned way to move a ring — never delete one (audit B1).
 */
export function Field({ children, className, ...rest }: FieldProps) {
  return (
    <div
      {...rest}
      className={[
        "flex h-control-md items-center gap-sm rounded-sm border border-border bg-surface-base px-md text-text-secondary",
        "focus-within:[outline:var(--focus-ring-width)_solid_var(--color-focus-ring)]",
        "focus-within:[outline-offset:var(--focus-ring-offset)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
