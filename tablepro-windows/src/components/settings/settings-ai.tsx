import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import type {
  AiProviderConfig,
  AiFeature,
  AiFeatureRoute,
  ProviderType,
} from "../../types/settings";
import { PROVIDER_PRESETS } from "../../types/settings";
import {
  SettingRow,
  SettingSection,
  Select,
  TextInput,
  PasswordInput,
  Toggle,
  Slider,
} from "./settings-form";

const PROVIDER_TYPE_OPTIONS: { label: string; value: ProviderType }[] = [
  { label: "OpenAI", value: "openai" },
  { label: "OpenRouter", value: "openrouter" },
  { label: "LM Studio", value: "lmstudio" },
  { label: "Ollama", value: "ollama" },
  { label: "Custom", value: "custom" },
];

const ALL_FEATURES: AiFeature[] = ["chat", "explainQuery", "fixError", "inlineSuggestions"];

export function SettingsAi() {
  const { t } = useTranslation();
  const { settings, saveSettings } = useSettingsStore();
  const ai = settings.ai;

  const [testStatus, setTestStatus] = useState<Record<string, "ok" | "err" | "loading">>({});
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});

  const featureLabels: Record<AiFeature, string> = {
    chat: t("settings.ai.features.chat"),
    explainQuery: t("settings.ai.features.explainQuery"),
    fixError: t("settings.ai.features.fixError"),
    inlineSuggestions: t("settings.ai.features.inlineSuggestions"),
  };

  const updateAi = (patch: Partial<typeof ai>) => {
    void saveSettings({ ai: { ...ai, ...patch } });
  };

  const addProvider = () => {
    const id = crypto.randomUUID();
    const newProvider: AiProviderConfig = {
      id,
      providerType: "openai",
      displayName: "OpenAI",
      baseUrl: PROVIDER_PRESETS.openai.baseUrl,
      apiKey: "",
      model: "",
      isEnabled: true,
    };
    updateAi({ providers: [...ai.providers, newProvider] });
  };

  const removeProvider = (id: string) => {
    updateAi({
      providers: ai.providers.filter((p) => p.id !== id),
      featureRouting: ai.featureRouting.filter((r) => r.providerId !== id),
    });
  };

  const updateProvider = (id: string, patch: Partial<AiProviderConfig>) => {
    updateAi({
      providers: ai.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const handleProviderTypeChange = (id: string, type: ProviderType) => {
    const preset = PROVIDER_PRESETS[type];
    updateProvider(id, {
      providerType: type,
      displayName: preset.displayName,
      baseUrl: preset.baseUrl,
    });
  };

  const testConnection = async (provider: AiProviderConfig) => {
    setTestStatus((s) => ({ ...s, [provider.id]: "loading" }));
    try {
      await invoke("ai_test_provider", { providerConfig: provider });
      setTestStatus((s) => ({ ...s, [provider.id]: "ok" }));
    } catch {
      setTestStatus((s) => ({ ...s, [provider.id]: "err" }));
    }
  };

  const fetchModels = async (provider: AiProviderConfig) => {
    try {
      const models = await invoke<string[]>("ai_list_models", { providerConfig: provider });
      setFetchedModels((s) => ({ ...s, [provider.id]: models }));
    } catch {
      setFetchedModels((s) => ({ ...s, [provider.id]: [] }));
    }
  };

  const updateRoute = (feature: AiFeature, patch: Partial<AiFeatureRoute>) => {
    const existing = ai.featureRouting.find((r) => r.feature === feature);
    const base: AiFeatureRoute = existing ?? { feature, providerId: "", model: "" };
    const updated = { ...base, ...patch };
    const newRouting = existing
      ? ai.featureRouting.map((r) => (r.feature === feature ? updated : r))
      : [...ai.featureRouting, updated];
    updateAi({ featureRouting: newRouting });
  };

  const providerOptions = ai.providers.map((p) => ({
    label: p.displayName || p.providerType,
    value: p.id,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Providers */}
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        <div className="flex items-center justify-between">
          <SettingSection title={t("settings.ai.providers")} />
          <button
            onClick={addProvider}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-zinc-800"
          >
            <Plus size={12} /> {t("common.add")}
          </button>
        </div>

        {ai.providers.length === 0 && (
          <p className="py-3 text-xs text-zinc-400">{t("settings.ai.noProviders")}</p>
        )}

        {ai.providers.map((provider) => (
          <div key={provider.id} className="flex flex-col gap-2 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {provider.displayName || t("settings.ai.untitled")}
              </span>
              <button
                onClick={() => removeProvider(provider.id)}
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-zinc-800"
                aria-label={t("settings.ai.removeProvider")}
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500">{t("settings.ai.type")}</span>
                <Select
                  value={provider.providerType}
                  onChange={(v) => handleProviderTypeChange(provider.id, v as ProviderType)}
                  options={PROVIDER_TYPE_OPTIONS}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500">{t("settings.ai.displayName")}</span>
                <TextInput
                  value={provider.displayName}
                  onChange={(v) => updateProvider(provider.id, { displayName: v })}
                  placeholder="Name"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500">{t("settings.ai.baseUrl")}</span>
                <TextInput
                  value={provider.baseUrl}
                  onChange={(v) => updateProvider(provider.id, { baseUrl: v })}
                  placeholder="https://..."
                  className="w-full"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500">{t("settings.ai.apiKey")}</span>
                <PasswordInput
                  value={provider.apiKey}
                  onChange={(v) => updateProvider(provider.id, { apiKey: v })}
                  placeholder="sk-..."
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-zinc-500">{t("settings.ai.model")}</span>
                {(fetchedModels[provider.id]?.length ?? 0) > 0 ? (
                  <Select
                    value={provider.model}
                    onChange={(v) => updateProvider(provider.id, { model: v })}
                    options={fetchedModels[provider.id].map((m) => ({ label: m, value: m }))}
                  />
                ) : (
                  <TextInput
                    value={provider.model}
                    onChange={(v) => updateProvider(provider.id, { model: v })}
                    placeholder="gpt-4o"
                  />
                )}
              </label>
              <label className="flex items-end gap-2 pb-0.5">
                <span className="text-[10px] text-zinc-500">{t("settings.ai.enabled")}</span>
                <Toggle
                  checked={provider.isEnabled}
                  onChange={(v) => updateProvider(provider.id, { isEnabled: v })}
                />
              </label>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void testConnection(provider)}
                className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {testStatus[provider.id] === "loading"
                  ? t("settings.ai.testing")
                  : testStatus[provider.id] === "ok"
                    ? t("settings.ai.testConnected")
                    : testStatus[provider.id] === "err"
                      ? t("settings.ai.testFailed")
                      : t("connection.card.testConnection")}
              </button>
              <button
                onClick={() => void fetchModels(provider)}
                className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {t("settings.ai.fetchModels")}
              </button>
              {testStatus[provider.id] === "ok" && (
                <span className="text-[10px] text-green-600 dark:text-green-400">✓</span>
              )}
              {testStatus[provider.id] === "err" && (
                <span className="text-[10px] text-red-500">✗</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Feature Routing */}
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        <SettingSection title={t("settings.ai.featureRouting")} />
        {ai.providers.length === 0 ? (
          <p className="py-3 text-xs text-zinc-400">{t("settings.ai.noProvidersRouting")}</p>
        ) : (
          ALL_FEATURES.map((feature) => {
            const route = ai.featureRouting.find((r) => r.feature === feature);
            const selectedProvider = ai.providers.find((p) => p.id === route?.providerId);
            const modelOptions = fetchedModels[route?.providerId ?? ""] ?? [];
            return (
              <SettingRow key={feature} label={featureLabels[feature]}>
                <div className="flex items-center gap-2">
                  <Select
                    value={route?.providerId ?? ""}
                    onChange={(v) => updateRoute(feature, { providerId: v, model: selectedProvider?.model ?? "" })}
                    options={[{ label: t("settings.ai.none"), value: "" }, ...providerOptions]}
                  />
                  {route?.providerId && (
                    modelOptions.length > 0 ? (
                      <Select
                        value={route.model}
                        onChange={(v) => updateRoute(feature, { model: v })}
                        options={modelOptions.map((m) => ({ label: m, value: m }))}
                      />
                    ) : (
                      <TextInput
                        value={route?.model ?? ""}
                        onChange={(v) => updateRoute(feature, { model: v })}
                        placeholder="model"
                      />
                    )
                  )}
                </div>
              </SettingRow>
            );
          })
        )}
      </div>

      {/* General AI settings */}
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        <SettingSection title={t("settings.ai.generalTitle")} />

        <SettingRow label={t("settings.ai.maxSchemaTables")} description={t("settings.ai.maxSchemaTablesDesc")}>
          <Slider
            value={ai.maxSchemaTables}
            onChange={(v) => updateAi({ maxSchemaTables: v })}
            min={1}
            max={50}
          />
        </SettingRow>

        <SettingRow label={t("settings.ai.inlineSuggestions")} description={t("settings.ai.inlineSuggestionsDesc")}>
          <Toggle
            checked={ai.enableInlineSuggestions}
            onChange={(v) => updateAi({ enableInlineSuggestions: v })}
          />
        </SettingRow>
      </div>
    </div>
  );
}
