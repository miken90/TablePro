import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection, Select, TextInput } from "./settings-form";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000].map((v) => ({ label: String(v), value: v }));

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Tiếng Việt", value: "vi" },
];

export function SettingsGeneral() {
  const { t } = useTranslation();
  const { settings, saveSettings } = useSettingsStore();

  const DATE_FORMAT_OPTIONS = [
    { label: t("settings.general.dateFormats.iso"), value: "iso" },
    { label: t("settings.general.dateFormats.us"), value: "us" },
    { label: t("settings.general.dateFormats.eu"), value: "eu" },
    { label: t("settings.general.dateFormats.unix"), value: "unix" },
  ];

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title={t("settings.general.title")} />

      <SettingRow label={t("settings.general.language")} description={t("settings.general.languageDesc")}>
        <Select
          value={settings.language}
          onChange={(v) => void saveSettings({ language: v })}
          options={LANGUAGE_OPTIONS}
        />
      </SettingRow>

      <SettingRow label={t("settings.general.pageSize")} description={t("settings.general.pageSizeDesc")}>
        <Select
          value={settings.pageSize}
          onChange={(v) => void saveSettings({ pageSize: Number(v) })}
          options={PAGE_SIZE_OPTIONS}
        />
      </SettingRow>

      <SettingRow label={t("settings.general.nullDisplay")} description={t("settings.general.nullDisplayDesc")}>
        <TextInput
          value={settings.nullDisplay}
          onChange={(v) => void saveSettings({ nullDisplay: v })}
          placeholder="NULL"
        />
      </SettingRow>

      <SettingRow label={t("settings.general.dateFormat")} description={t("settings.general.dateFormatDesc")}>
        <Select
          value={settings.dateFormat}
          onChange={(v) => void saveSettings({ dateFormat: v })}
          options={DATE_FORMAT_OPTIONS}
        />
      </SettingRow>
    </div>
  );
}
