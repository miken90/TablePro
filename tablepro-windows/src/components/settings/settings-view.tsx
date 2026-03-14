import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";
import { SettingsGeneral } from "./settings-general";
import { SettingsEditor } from "./settings-editor";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsConnection } from "./settings-connection";

const SECTIONS = ["General", "Editor", "Appearance", "Connection"] as const;
type Section = (typeof SECTIONS)[number];

interface SettingsViewProps {
  initialSection?: Section;
  onClose: () => void;
}

export function SettingsView({ initialSection = "General", onClose }: SettingsViewProps) {
  const [section, setSection] = useState<Section>(initialSection);
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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleOverlayClick}
    >
      <div className="flex h-[600px] w-[760px] max-w-[95vw] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Settings</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar nav */}
          <nav className="flex w-40 flex-shrink-0 flex-col gap-0.5 border-r border-zinc-200 p-2 dark:border-zinc-700">
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`rounded px-3 py-1.5 text-left text-xs ${
                  s === section
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {s}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            {section === "General" && <SettingsGeneral />}
            {section === "Editor" && <SettingsEditor />}
            {section === "Appearance" && <SettingsAppearance />}
            {section === "Connection" && <SettingsConnection />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 dark:border-zinc-700">
          <button
            onClick={handleReset}
            className="rounded px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
