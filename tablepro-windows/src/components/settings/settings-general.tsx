import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection, Select, TextInput } from "./settings-form";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000].map((v) => ({ label: String(v), value: v }));
const DATE_FORMAT_OPTIONS = [
  { label: "ISO 8601 (2026-03-13)", value: "iso" },
  { label: "US (03/13/2026)", value: "us" },
  { label: "EU (13/03/2026)", value: "eu" },
  { label: "Unix timestamp", value: "unix" },
];

export function SettingsGeneral() {
  const { settings, saveSettings } = useSettingsStore();

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title="General" />

      <SettingRow label="Page size" description="Number of rows loaded per page">
        <Select
          value={settings.pageSize}
          onChange={(v) => void saveSettings({ pageSize: Number(v) })}
          options={PAGE_SIZE_OPTIONS}
        />
      </SettingRow>

      <SettingRow label="Null display" description="Text shown for NULL values">
        <TextInput
          value={settings.nullDisplay}
          onChange={(v) => void saveSettings({ nullDisplay: v })}
          placeholder="NULL"
        />
      </SettingRow>

      <SettingRow label="Date format" description="How dates are displayed in results">
        <Select
          value={settings.dateFormat}
          onChange={(v) => void saveSettings({ dateFormat: v })}
          options={DATE_FORMAT_OPTIONS}
        />
      </SettingRow>
    </div>
  );
}
