import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { SettingRow, SettingSection } from "./settings-form";

type ThemeValue = "light" | "dark" | "system";

export function SettingsAppearance() {
  const { t } = useTranslation();
  const { settings, saveSettings } = useSettingsStore();
  const cardRefs = useRef(new Map<ThemeValue, HTMLButtonElement>());

  const THEME_OPTIONS: { value: ThemeValue; label: string }[] = [
    { value: "light", label: t("settings.appearance.themes.light") },
    { value: "dark", label: t("settings.appearance.themes.dark") },
    { value: "system", label: t("settings.appearance.themes.system") },
  ];

  function selectTheme(value: ThemeValue) {
    void saveSettings({ theme: value });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const index = THEME_OPTIONS.findIndex((o) => o.value === settings.theme);
    if (index === -1) return;
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIndex = (index + 1) % THEME_OPTIONS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIndex = (index - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    if (nextIndex === null) return;
    e.preventDefault();
    const next = THEME_OPTIONS[nextIndex];
    selectTheme(next.value);
    cardRefs.current.get(next.value)?.focus();
  }

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title={t("settings.appearance.title")} />

      <SettingRow label={t("settings.appearance.theme")} description={t("settings.appearance.themeDesc")}>
        <div role="radiogroup" onKeyDown={handleKeyDown} className="flex gap-1.5">
          {THEME_OPTIONS.map((opt) => {
            const checked = settings.theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                ref={(el) => {
                  if (el) cardRefs.current.set(opt.value, el);
                  else cardRefs.current.delete(opt.value);
                }}
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => selectTheme(opt.value)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  checked
                    ? "border-accent-blue bg-accent-blue-subtle text-accent-blue"
                    : "border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingRow>
    </div>
  );
}
