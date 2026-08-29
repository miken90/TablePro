import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import { SettingsGeneral } from "./settings-general";
import { SettingsEditor } from "./settings-editor";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsConnection } from "./settings-connection";
import { SettingsAi } from "./settings-ai";
import { SettingsShortcuts } from "./settings-shortcuts";
import { SettingsPerformance } from "./settings-performance";
import { SettingsDiagnostics } from "./settings-diagnostics";
import { Dialog } from "../ui";

const SECTION_KEYS = ["general", "editor", "appearance", "connection", "ai", "performance", "diagnostics", "shortcuts"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

interface SettingsViewProps {
  initialSection?: SectionKey;
  onClose: () => void;
}

export function SettingsView({ initialSection = "general", onClose }: SettingsViewProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionKey>(initialSection);
  const { saveSettings } = useSettingsStore();

  const handleReset = async () => {
    await saveSettings(DEFAULT_SETTINGS);
  };

  const sectionLabels: Record<SectionKey, string> = {
    general: t("settings.sections.general"),
    editor: t("settings.sections.editor"),
    appearance: t("settings.sections.appearance"),
    connection: t("settings.sections.connection"),
    ai: t("settings.sections.ai"),
    performance: t("settings.sections.performance"),
    diagnostics: "Diagnostics",
    shortcuts: t("settings.sections.shortcuts"),
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("settings.title")}
      size="lg"
      cancelLabel={t("common.done")}
      actions={[{ label: t("settings.resetToDefaults"), onClick: () => void handleReset(), variant: 'secondary' }]}
    >
        {/* Body */}
        <div className="-m-2xl flex h-[500px] overflow-hidden">
          {/* Sidebar nav */}
          <nav className="flex w-40 flex-shrink-0 flex-col gap-0.5 border-r border-zinc-200 p-2 dark:border-zinc-700">
            {SECTION_KEYS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`rounded px-3 py-1.5 text-left text-xs ${
                  s === section
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {sectionLabels[s]}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            {section === "general" && <SettingsGeneral />}
            {section === "editor" && <SettingsEditor />}
            {section === "appearance" && <SettingsAppearance />}
            {section === "connection" && <SettingsConnection />}
            {section === "ai" && <SettingsAi />}
            {section === "performance" && <SettingsPerformance />}
            {section === "diagnostics" && <SettingsDiagnostics />}
            {section === "shortcuts" && <SettingsShortcuts />}
          </div>
        </div>
    </Dialog>
  );
}
