import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection } from "./settings-form";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function SettingsAppearance() {
  const { settings, saveSettings } = useSettingsStore();

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title="Appearance" />

      <SettingRow label="Theme" description="Color theme for the application">
        <div className="flex gap-1">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => void saveSettings({ theme: opt.value })}
              className={`rounded px-3 py-1 text-xs ${
                settings.theme === opt.value
                  ? "bg-blue-600 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingRow>
    </div>
  );
}
