import { useId, type InputHTMLAttributes } from "react";

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> {
  invalid?: boolean;
  /** Renders below the field in `role="alert"`; also sets `invalid`. */
  errorMessage?: string;
  className?: string;
}

/**
 * Standalone bordered input (design-spec 5.16 "Input / Select"). The focus
 * outline is never suppressed — the global `*:focus-visible` rule already
 * draws the ring; this only swaps the border colour on top of it (audit B1).
 */
export function TextInput({
  invalid = false,
  errorMessage,
  disabled,
  readOnly,
  className,
  id,
  ...rest
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const isInvalid = invalid || Boolean(errorMessage);

  return (
    <div className="flex flex-col gap-2xs">
      <input
        {...rest}
        id={inputId}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={isInvalid || undefined}
        aria-describedby={errorId}
        className={[
          "h-control-md rounded-sm border px-md text-ui-md text-text-primary",
          "placeholder:text-text-secondary",
          "transition-colors duration-fast ease-snappy",
          "focus-visible:border-focus-ring",
          isInvalid ? "border-accent-red" : "border-border",
          readOnly ? "bg-surface-muted" : "bg-surface-base",
          "disabled:opacity-[.45] disabled:cursor-not-allowed",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {errorMessage && (
        <p id={errorId} role="alert" className="text-ui-xs text-state-danger-fg">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
