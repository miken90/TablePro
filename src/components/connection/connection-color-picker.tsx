interface ConnectionColorPickerProps {
  value?: string;
  onChange: (value?: string) => void;
}

/**
 * The ten fixed presets (design-spec 5.7). `value`/`onChange` stay hex
 * strings — that is the persisted shape already saved in every connection
 * and group on disk — but each swatch paints from the matching
 * theme-invariant --color-conn-* custom property, so a re-tuned palette
 * updates every saved connection's swatch without a data migration.
 */
const PRESET_COLORS = [
  { name: "Red", hex: "#ef4444", token: "var(--color-conn-red)" },
  { name: "Orange", hex: "#f97316", token: "var(--color-conn-orange)" },
  { name: "Amber", hex: "#f59e0b", token: "var(--color-conn-amber)" },
  { name: "Yellow", hex: "#eab308", token: "var(--color-conn-yellow)" },
  { name: "Green", hex: "#22c55e", token: "var(--color-conn-green)" },
  { name: "Emerald", hex: "#10b981", token: "var(--color-conn-emerald)" },
  { name: "Blue", hex: "#3b82f6", token: "var(--color-conn-blue)" },
  { name: "Indigo", hex: "#6366f1", token: "var(--color-conn-indigo)" },
  { name: "Purple", hex: "#a855f7", token: "var(--color-conn-purple)" },
  { name: "Pink", hex: "#ec4899", token: "var(--color-conn-pink)" },
];

export function ConnectionColorPicker({ value, onChange }: ConnectionColorPickerProps) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Connection colour">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        aria-pressed={!value}
        className={`rounded border px-2 py-1 text-[11px] ${
          !value
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-zinc-300 text-zinc-500 dark:border-zinc-600"
        }`}
      >
        None
      </button>
      {PRESET_COLORS.map((color) => {
        const selected = value === color.hex;
        return (
          <button
            key={color.hex}
            type="button"
            onClick={() => onChange(color.hex)}
            title={color.name}
            aria-label={color.name}
            aria-pressed={selected}
            className={`h-5 w-5 rounded-full border ${
              selected
                ? "border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                : "border-zinc-300 dark:border-zinc-600"
            }`}
            style={{ backgroundColor: color.token }}
          />
        );
      })}
    </div>
  );
}
