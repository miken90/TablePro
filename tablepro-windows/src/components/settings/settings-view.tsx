import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import { SettingsGeneral } from "./settings-general";
import { SettingsEditor } from "./settings-editor";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsConnection } from "./settings-connection";
import { SettingsAi } from "./settings-ai";
import { SettingsShortcuts } from "./settings-shortcuts";

const SECTION_KEYS = ["general", "editor", "appearance", "connection", "ai", "shortcuts"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

interface SettingsViewProps {
  initialSection?: SectionKey;
  onClose: () => void;
}

export function SettingsView({ initialSection = "general", onClose }: SettingsViewProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionKey>(initialSection);
  const { saveSettings } = useSettingsStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleReset = async () => {
    await saveSettings(DEFAULT_SETTINGS);
  };

  const sectionLabels: Record<SectionKey, string> = {
    general: t("settings.sections.general"),
    editor: t("settings.sections.editor"),
    appearance: t("settings.sections.appearance"),
    connection: t("settings.sections.connection"),
    ai: t("settings.sections.ai"),
    shortcuts: t("settings.sections.shortcuts"),
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        className="flex h-[600px] w-[760px] max-w-[95vw] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{t("settings.title")}</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label={t("settings.closeSettings")}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
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
            {section === "shortcuts" && <SettingsShortcuts />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 dark:border-zinc-700">
          <button
            onClick={handleReset}
            className="rounded px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            {t("settings.resetToDefaults")}
          </button>
          <button
            onClick={onClose}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
