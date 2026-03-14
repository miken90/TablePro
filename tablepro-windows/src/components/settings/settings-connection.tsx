import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection, NumberInput, Toggle } from "./settings-form";

export function SettingsConnection() {
  const { settings, saveSettings } = useSettingsStore();

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title="Connection" />

      <SettingRow label="Default timeout" description="Query timeout in seconds (0 = unlimited)">
        <NumberInput
          value={settings.defaultTimeoutSecs}
          onChange={(v) => void saveSettings({ defaultTimeoutSecs: Math.max(0, v) })}
          min={0}
          max={3600}
        />
      </SettingRow>

      <SettingRow
        label="Safe mode"
        description="Warn before running destructive queries (DELETE, DROP, TRUNCATE)"
      >
        <Toggle
          checked={settings.safeMode}
          onChange={(v) => void saveSettings({ safeMode: v })}
        />
      </SettingRow>
    </div>
  );
}
