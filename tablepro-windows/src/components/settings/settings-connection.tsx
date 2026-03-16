import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection, NumberInput, Select } from "./settings-form";

const SAFE_MODE_OPTIONS = [
  { value: 0, label: "0 – Off: no checks" },
  { value: 1, label: "1 – Silent: log to console only" },
  { value: 2, label: "2 – Alert: confirm DELETE/DROP/TRUNCATE" },
  { value: 3, label: "3 – Alert+: confirm all DML + DDL" },
  { value: 4, label: "4 – Safe: confirm + type table name" },
  { value: 5, label: "5 – Read-Only: block all writes" },
];

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
        description="Controls query confirmation before destructive or write operations"
      >
        <Select
          value={settings.safeModeLevel}
          onChange={(v) => void saveSettings({ safeModeLevel: Number(v) })}
          options={SAFE_MODE_OPTIONS}
        />
      </SettingRow>
    </div>
  );
}
