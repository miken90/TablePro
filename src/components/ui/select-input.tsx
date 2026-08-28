import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectInputProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  invalid?: boolean;
  /** Renders below the field in `role="alert"`; also sets `invalid`. */
  errorMessage?: string;
  className?: string;
  children: ReactNode;
}

/** Same border/bg/focus contract as TextInput — bg is always `--color-bg-base`, never elevated (audit m14). */
export function SelectInput({
  invalid = false,
  errorMessage,
  disabled,
  className,
  id,
  children,
  ...rest
}: SelectInputProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = errorMessage ? `${selectId}-error` : undefined;
  const isInvalid = invalid || Boolean(errorMessage);

  return (
    <div className="flex flex-col gap-2xs">
      <div className="relative">
        <select
          {...rest}
          id={selectId}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={errorId}
          className={[
            "h-control-md w-full appearance-none rounded-sm border bg-surface-base px-md pr-2xl text-ui-md text-text-primary",
            "transition-colors duration-fast ease-snappy",
            "focus-visible:border-focus-ring",
            isInvalid ? "border-accent-red" : "border-border",
            "disabled:opacity-[.45] disabled:cursor-not-allowed",
            className ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-sm top-1/2 -translate-y-1/2 text-text-secondary"
        />
      </div>
      {errorMessage && (
        <p id={errorId} role="alert" className="text-ui-xs text-state-danger-fg">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
