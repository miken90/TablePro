import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection, NumberInput, Select } from "./settings-form";

export function SettingsConnection() {
  const { t } = useTranslation();
  const { settings, saveSettings } = useSettingsStore();

  const SAFE_MODE_OPTIONS = [
    { value: 0, label: t("settings.connection.safeModeOptions.off") },
    { value: 1, label: t("settings.connection.safeModeOptions.silent") },
    { value: 2, label: t("settings.connection.safeModeOptions.alert") },
    { value: 3, label: t("settings.connection.safeModeOptions.alertPlus") },
    { value: 4, label: t("settings.connection.safeModeOptions.safe") },
    { value: 5, label: t("settings.connection.safeModeOptions.readOnly") },
  ];

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title={t("settings.connection.title")} />

      <SettingRow label={t("settings.connection.defaultTimeout")} description={t("settings.connection.defaultTimeoutDesc")}>
        <NumberInput
          value={settings.defaultTimeoutSecs}
          onChange={(v) => void saveSettings({ defaultTimeoutSecs: Math.max(0, v) })}
          min={0}
          max={3600}
        />
      </SettingRow>

      <SettingRow
        label={t("settings.connection.safeMode")}
        description={t("settings.connection.safeModeDesc")}
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
