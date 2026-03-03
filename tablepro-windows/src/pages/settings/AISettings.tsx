import { useState } from "react";
import { useSettingsStore } from "../../stores/settings";

export function AISettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const ai = settings.ai;

  const update = (patch: Partial<typeof ai>) => {
    updateSection("ai", { ...ai, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">AI</h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Default Provider</label>
        <select
          value={ai.defaultProvider}
          onChange={(e) => update({ defaultProvider: e.target.value })}
          className="select-field"
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      <ApiKeyField
        label="OpenAI API Key"
        value={ai.openaiApiKey}
        onChange={(v) => update({ openaiApiKey: v })}
      />

      <ApiKeyField
        label="Anthropic API Key"
        value={ai.anthropicApiKey}
        onChange={(v) => update({ anthropicApiKey: v })}
      />

      <ApiKeyField
        label="Gemini API Key"
        value={ai.geminiApiKey}
        onChange={(v) => update({ geminiApiKey: v })}
      />

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Ollama Host</label>
        <input
          type="text"
          value={ai.ollamaHost}
          onChange={(e) => update({ ollamaHost: e.target.value })}
          className="input-field w-60"
          placeholder="http://localhost:11434"
        />
      </div>

      <Toggle
        label="Include database schema in AI context"
        checked={ai.includeSchema}
        onChange={(v) => update({ includeSchema: v })}
      />

      <Toggle
        label="Include current query in AI context"
        checked={ai.includeCurrentQuery}
        onChange={(v) => update({ includeCurrentQuery: v })}
      />
    </div>
  );
}

function ApiKeyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-700 dark:text-zinc-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field w-56"
          placeholder="sk-…"
        />
        <button
          onClick={() => setVisible(!visible)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-blue-600" : "bg-zinc-600"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-4" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
