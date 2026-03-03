import { useSettingsStore } from "../../stores/settings";

const accentColors = [
  { id: "blue", label: "Blue", color: "#3b82f6" },
  { id: "purple", label: "Purple", color: "#8b5cf6" },
  { id: "pink", label: "Pink", color: "#ec4899" },
  { id: "red", label: "Red", color: "#ef4444" },
  { id: "orange", label: "Orange", color: "#f97316" },
  { id: "yellow", label: "Yellow", color: "#eab308" },
  { id: "green", label: "Green", color: "#22c55e" },
  { id: "graphite", label: "Graphite", color: "#6b7280" },
];

export function AppearanceSettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const appearance = settings.appearance;

  const update = (patch: Partial<typeof appearance>) => {
    updateSection("appearance", { ...appearance, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Appearance</h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Theme</label>
        <div className="flex gap-2">
          {(["system", "light", "dark"] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => update({ theme })}
              className={`rounded-lg px-4 py-1.5 text-sm capitalize transition ${
                appearance.theme === theme
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-3 block text-sm text-zinc-700 dark:text-zinc-300">Accent Color</label>
        <div className="flex flex-wrap gap-3">
          {accentColors.map((c) => (
            <button
              key={c.id}
              onClick={() => update({ accentColor: c.id })}
              title={c.label}
              className={`h-8 w-8 rounded-full border-2 transition ${
                appearance.accentColor === c.id
                  ? "border-white scale-110"
                  : "border-transparent hover:border-zinc-500"
              }`}
              style={{ backgroundColor: c.color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
