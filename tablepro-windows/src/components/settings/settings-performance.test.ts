import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../../stores/settingsStore";
import { DEFAULT_SETTINGS } from "../../types/settings";

describe("settings perf fields", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, isLoaded: true });
  });

  it("DEFAULT_SETTINGS has streamingThreshold=10000 and storeMaxRows=100000", () => {
    expect(DEFAULT_SETTINGS.streamingThreshold).toBe(10_000);
    expect(DEFAULT_SETTINGS.storeMaxRows).toBe(100_000);
  });

  it("saveSettings merges streamingThreshold without losing other fields", async () => {
    await useSettingsStore.getState().saveSettings({ streamingThreshold: 50_000 });
    const s = useSettingsStore.getState().settings;
    expect(s.streamingThreshold).toBe(50_000);
    expect(s.storeMaxRows).toBe(100_000);
    expect(s.pageSize).toBe(DEFAULT_SETTINGS.pageSize);
  });

  it("saveSettings can update storeMaxRows independently", async () => {
    await useSettingsStore.getState().saveSettings({ storeMaxRows: 500_000 });
    expect(useSettingsStore.getState().settings.storeMaxRows).toBe(500_000);
  });
});
