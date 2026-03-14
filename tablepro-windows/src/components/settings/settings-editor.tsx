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
  const { settings, saveSettings } = useSettingsStore();

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title="Editor" />

      <SettingRow label="Font" description="Editor font family">
        <Select
          value={settings.editorFont}
          onChange={(v) => void saveSettings({ editorFont: v })}
          options={FONT_OPTIONS}
        />
      </SettingRow>

      <SettingRow label="Font size" description="Editor font size (10–24)">
        <NumberInput
          value={settings.editorFontSize}
          onChange={(v) => void saveSettings({ editorFontSize: Math.min(24, Math.max(10, v)) })}
          min={10}
          max={24}
        />
      </SettingRow>

      <SettingRow label="Vim mode" description="Enable Vim keybindings in the editor">
        <Toggle
          checked={settings.vimMode}
          onChange={(v) => void saveSettings({ vimMode: v })}
        />
      </SettingRow>

      <SettingRow label="Tab size" description="Number of spaces per tab">
        <Select
          value={settings.tabSize}
          onChange={(v) => void saveSettings({ tabSize: Number(v) })}
          options={TAB_SIZE_OPTIONS}
        />
      </SettingRow>

      <SettingRow label="Word wrap" description="Wrap long lines in the editor">
        <Toggle
          checked={settings.wordWrap}
          onChange={(v) => void saveSettings({ wordWrap: v })}
        />
      </SettingRow>
    </div>
  );
}
