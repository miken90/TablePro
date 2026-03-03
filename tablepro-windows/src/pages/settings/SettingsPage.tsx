import { useState, useEffect } from "react";
import { useSettingsStore } from "../../stores/settings";
import { GeneralSettings } from "./GeneralSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { EditorSettings } from "./EditorSettings";
import { DataGridSettings } from "./DataGridSettings";
import { AISettings } from "./AISettings";
import { HistorySettings } from "./HistorySettings";
import { KeyboardSettings } from "./KeyboardSettings";
import { LicenseSettings } from "./LicenseSettings";

type SettingsTab =
  | "general"
  | "appearance"
  | "editor"
  | "dataGrid"
  | "ai"
  | "history"
  | "keyboard"
  | "license";

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "⚙️" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "editor", label: "Editor", icon: "📝" },
  { id: "dataGrid", label: "Data Grid", icon: "📊" },
  { id: "ai", label: "AI", icon: "🤖" },
  { id: "history", label: "History", icon: "📜" },
  { id: "keyboard", label: "Keyboard", icon: "⌨️" },
  { id: "license", label: "License", icon: "🔑" },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { settings, loading, loadSettings, resetSettings } =
    useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loading || !settings) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <nav className="flex w-52 flex-col border-r border-zinc-200 bg-zinc-50 py-4 dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="mb-4 px-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Settings
        </h2>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-left text-sm transition ${
              activeTab === tab.id
                ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <div className="mt-auto px-4 pt-4">
          <button
            onClick={resetSettings}
            className="w-full rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-900/30"
          >
            Reset All Settings
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === "general" && <GeneralSettings />}
        {activeTab === "appearance" && <AppearanceSettings />}
        {activeTab === "editor" && <EditorSettings />}
        {activeTab === "dataGrid" && <DataGridSettings />}
        {activeTab === "ai" && <AISettings />}
        {activeTab === "history" && <HistorySettings />}
        {activeTab === "keyboard" && <KeyboardSettings />}
        {activeTab === "license" && <LicenseSettings />}
      </main>
    </div>
  );
}
