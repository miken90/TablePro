import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import { AI_PROVIDERS, type AIProviderType } from "../../types/ai";

interface AISettingsSectionProps {
  defaultProvider: string;
  ollamaHost: string;
  onProviderChange: (provider: string) => void;
  onOllamaHostChange: (host: string) => void;
}

function ApiKeyInput({
  provider,
  label,
}: {
  provider: AIProviderType;
  label: string;
}) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<string | null>("ai_load_api_key", { provider }).then((k) => {
      if (k) setKey(k);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [provider]);

  const handleSave = useCallback(async () => {
    try {
      await invoke("ai_save_api_key", { provider, key });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore save errors
    }
  }, [provider, key]);

  if (!loaded) return null;

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={`Enter ${label}`}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 pr-8 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
          />
          <button
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            {visible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <button
          onClick={handleSave}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-600"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function AISettingsSection({
  defaultProvider,
  ollamaHost,
  onProviderChange,
  onOllamaHostChange,
}: AISettingsSectionProps) {
  const [ollamaDetected, setOllamaDetected] = useState<boolean | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleDetectOllama = useCallback(async () => {
    setDetecting(true);
    try {
      const detected = await invoke<boolean>("ai_detect_ollama");
      setOllamaDetected(detected);
    } catch {
      setOllamaDetected(false);
    } finally {
      setDetecting(false);
    }
  }, []);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const apiKey = await invoke<string | null>("ai_load_api_key", {
        provider: defaultProvider,
      });
      const baseUrl =
        defaultProvider === "ollama" ? `${ollamaHost}/v1` : undefined;

      await invoke<string>("ai_chat", {
        connectionId: null,
        messages: [{ role: "user", content: "Say hi" }],
        provider: defaultProvider,
        apiKey: apiKey ?? "",
        model:
          AI_PROVIDERS.find((p) => p.value === defaultProvider)?.defaultModel ??
          "",
        baseUrl: baseUrl ?? null,
        includeSchema: false,
      });
      setTestResult({ success: true, message: "Connection successful" });
    } catch (err) {
      setTestResult({ success: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  }, [defaultProvider, ollamaHost]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-zinc-200">AI Assistant</h3>

      <div className="space-y-1">
        <label className="text-xs text-zinc-400">Default Provider</label>
        <select
          value={defaultProvider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 outline-none"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <ApiKeyInput provider="openai" label="OpenAI API Key" />
      <ApiKeyInput provider="anthropic" label="Anthropic API Key" />
      <ApiKeyInput provider="gemini" label="Gemini API Key" />

      <div className="space-y-1">
        <label className="text-xs text-zinc-400">Ollama Host</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={ollamaHost}
            onChange={(e) => onOllamaHostChange(e.target.value)}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
          />
          <button
            onClick={handleDetectOllama}
            disabled={detecting}
            className="flex items-center gap-1 rounded-md bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-600 disabled:opacity-50"
          >
            {detecting ? <Loader2 size={12} className="animate-spin" /> : null}
            Detect
          </button>
        </div>
        {ollamaDetected !== null && (
          <p
            className={`text-xs ${ollamaDetected ? "text-green-400" : "text-zinc-500"}`}
          >
            {ollamaDetected
              ? "✓ Ollama detected on localhost:11434"
              : "Ollama not detected"}
          </p>
        )}
      </div>

      <div className="border-t border-zinc-700 pt-3">
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="flex items-center gap-2 rounded-md bg-zinc-700 px-4 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-600 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : null}
          Test Connection
        </button>
        {testResult && (
          <div
            className={`mt-2 flex items-center gap-1 text-xs ${testResult.success ? "text-green-400" : "text-red-400"}`}
          >
            {testResult.success ? (
              <CheckCircle size={12} />
            ) : (
              <XCircle size={12} />
            )}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
