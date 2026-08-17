interface ConnectionColorPickerProps {
  value?: string;
  onChange: (value?: string) => void;
}

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#10b981",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

export function ConnectionColorPicker({ value, onChange }: ConnectionColorPickerProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`rounded border px-2 py-1 text-[11px] ${
          !value
            ? "border-blue-500 text-blue-600 dark:text-blue-400"
            : "border-zinc-300 text-zinc-500 dark:border-zinc-600"
        }`}
      >
        None
      </button>
      {PRESET_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            title={color}
            className={`h-5 w-5 rounded-full border ${
              selected
                ? "border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                : "border-zinc-300 dark:border-zinc-600"
            }`}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}
