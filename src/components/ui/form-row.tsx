import { useId, type ReactNode } from "react";

export interface FormRowIds {
  controlId: string;
  /** The `<label>` element's own id — use as `aria-labelledby` when the
   * layout forbids nesting a native `<label for>` (e.g. a Field-wrapped
   * compound control). */
  labelId: string;
}

export interface FormRowProps {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: (ids: FormRowIds) => ReactNode;
}

/**
 * The label-over-control STACK (design-spec 5.16 — renamed off `.field`,
 * used by SCR-09/34/35). Not a box: a layout. No border, no height, no
 * background — the control inside owns all of that.
 */
export function FormRow({ label, hint, className, children }: FormRowProps) {
  const controlId = useId();
  const labelId = `${controlId}-label`;

  return (
    <div className={["flex flex-col gap-2xs", className ?? ""].filter(Boolean).join(" ")}>
      <label id={labelId} htmlFor={controlId} className="text-ui-xs text-text-secondary">
        {label}
      </label>
      {children({ controlId, labelId })}
      {hint && <span className="text-ui-xs text-text-secondary">{hint}</span>}
    </div>
  );
}
