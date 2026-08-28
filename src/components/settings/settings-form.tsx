import { cloneElement, isValidElement, useId, type ReactElement } from "react";

/** Aria-name plumbing every control primitive below accepts and applies to its real DOM control. */
interface AriaNameProps {
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * Reusable setting row: label + description on the left, control on the
 * right (M9). `children` is cloned with `aria-labelledby`/`aria-describedby`
 * pointing at this row's own label/description ids — the control primitives
 * below accept and forward those props to their real `<input>`/`<select>`/
 * `<button role="switch">`, so every row is accessibly named without any
 * pane restructuring its JSX (audit B4).
 */
export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactElement;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;

  const control = isValidElement<AriaNameProps>(children)
    ? cloneElement(children, {
        "aria-labelledby": labelId,
        ...(description ? { "aria-describedby": descId } : {}),
      })
    : children;

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-xs font-medium text-zinc-800 dark:text-zinc-100">{label}</span>
        {description && (
          <span id={descId} className="text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
        )}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

/** Section heading */
export function SettingSection({ title }: { title: string }) {
  return (
    <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-400 first:mt-0">
      {title}
    </h3>
  );
}

/** Toggle switch */
export function Toggle({
  checked,
  onChange,
  ...aria
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
} & AriaNameProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      {...aria}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Select dropdown */
export function Select({
  value,
  onChange,
  options,
  ...aria
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { label: string; value: string | number }[];
} & AriaNameProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...aria}
      className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Number input */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  ...aria
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
} & AriaNameProps) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      {...aria}
      className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
    />
  );
}

/** Text input */
export function TextInput({
  value,
  onChange,
  placeholder,
  className: extraClass,
  ...aria
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
} & AriaNameProps) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      {...aria}
      className={`rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 ${extraClass ?? "w-32"}`}
    />
  );
}

/** Password input */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  ...aria
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
} & AriaNameProps) {
  return (
    <input
      type="password"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      {...aria}
      className="w-40 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
    />
  );
}

/** Range slider with value display */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  ...aria
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
} & AriaNameProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        {...aria}
        className="h-1.5 w-24 cursor-pointer accent-blue-600"
      />
      <span className="min-w-[2ch] text-right text-xs text-zinc-600 dark:text-zinc-400">
        {value}
      </span>
    </div>
  );
}
