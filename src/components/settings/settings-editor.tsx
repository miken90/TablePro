import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection, Select, NumberInput, Toggle } from "./settings-form";

const FONT_OPTIONS = [
  { label: "Consolas", value: "Consolas" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Fira Code", value: "Fira Code" },
  { label: "Monaco", value: "Monaco" },
  { label: "monospace", value: "monospace" },
];
const TAB_SIZE_OPTIONS = [2, 4, 8].map((v) => ({ label: String(v), value: v }));

export function SettingsEditor() {
  const { t } = useTranslation();
  const { settings, saveSettings } = useSettingsStore();

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title={t("settings.editor.title")} />

      <SettingRow label={t("settings.editor.font")} description={t("settings.editor.fontDesc")}>
        <Select
          value={settings.editorFont}
          onChange={(v) => void saveSettings({ editorFont: v })}
          options={FONT_OPTIONS}
        />
      </SettingRow>

      <SettingRow label={t("settings.editor.fontSize")} description={t("settings.editor.fontSizeDesc")}>
        <NumberInput
          value={settings.editorFontSize}
          onChange={(v) => void saveSettings({ editorFontSize: Math.min(24, Math.max(10, v)) })}
          min={10}
          max={24}
        />
      </SettingRow>

      <SettingRow label={t("settings.editor.vimMode")} description={t("settings.editor.vimModeDesc")}>
        <Toggle
          checked={settings.vimMode}
          onChange={(v) => void saveSettings({ vimMode: v })}
        />
      </SettingRow>

      <SettingRow label={t("settings.editor.tabSize")} description={t("settings.editor.tabSizeDesc")}>
        <Select
          value={settings.tabSize}
          onChange={(v) => void saveSettings({ tabSize: Number(v) })}
          options={TAB_SIZE_OPTIONS}
        />
      </SettingRow>

      <SettingRow label={t("settings.editor.wordWrap")} description={t("settings.editor.wordWrapDesc")}>
        <Toggle
          checked={settings.wordWrap}
          onChange={(v) => void saveSettings({ wordWrap: v })}
        />
      </SettingRow>
    </div>
  );
}
