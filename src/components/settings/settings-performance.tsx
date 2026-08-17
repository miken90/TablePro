import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { NumberInput, SettingRow, SettingSection } from "./settings-form";

const STREAMING_MIN = 1_000;
const STREAMING_MAX = 1_000_000;
const STORE_MIN = 10_000;
const STORE_MAX = 10_000_000;

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(Math.max(v, min), max);
}

export function SettingsPerformance() {
  const { t } = useTranslation();
  const { settings, saveSettings } = useSettingsStore();

  return (
    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      <SettingSection title={t("settings.performance.title")} />

      <SettingRow
        label={t("settings.performance.streamingThreshold")}
        description={t("settings.performance.streamingThresholdDesc")}
      >
        <NumberInput
          value={settings.streamingThreshold}
          min={STREAMING_MIN}
          max={STREAMING_MAX}
          step={1000}
          onChange={(v) =>
            void saveSettings({ streamingThreshold: clamp(v, STREAMING_MIN, STREAMING_MAX) })
          }
        />
      </SettingRow>

      <SettingRow
        label={t("settings.performance.storeMaxRows")}
        description={t("settings.performance.storeMaxRowsDesc")}
      >
        <NumberInput
          value={settings.storeMaxRows}
          min={STORE_MIN}
          max={STORE_MAX}
          step={10_000}
          onChange={(v) =>
            void saveSettings({ storeMaxRows: clamp(v, STORE_MIN, STORE_MAX) })
          }
        />
      </SettingRow>
    </div>
  );
}
