import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sslModeHelpKey } from "../connection/ssl-mode-help";
import { OnboardingStep } from "./onboarding-step";
import { useConnectionStore } from "../../stores/connectionStore";
import type { ConnectionConfig, SavedConnection } from "../../types/connection";
import { classifyError } from "../../ipc/error";
import { testConnection } from "../../ipc/commands";
import {
  DB_TYPES,
  DB_PLACEHOLDERS,
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_PORTS,
  SSL_MODES,
  inputCls,
  secondaryBtn,
} from "../connection/connection-form-config";
import { Field, SshSection } from "../connection/connection-form-sections";

interface AddConnectionStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function AddConnectionStep({ onNext, onBack, onSkip }: AddConnectionStepProps) {
  const { t } = useTranslation();
  const { saveConnection } = useConnectionStore();

  // Local draft state - not saved to store until explicit save
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ConnectionConfig>({ ...DEFAULT_CONNECTION_CONFIG });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const updateConfig = (partial: Partial<ConnectionConfig>) =>
    setConfig((c) => {
      const next = { ...c, ...partial };
      if (partial.dbType && partial.dbType !== c.dbType) {
        next.port = DEFAULT_PORTS[partial.dbType] ?? 5432;
      }
      return next;
    });

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError(null);
    setErrorHint(null);
    try {
      await testConnection(config);
      setTestResult(t("onboarding.addConnection.testSuccess"));
    } catch (err) {
      const classified = classifyError(err);
      setError(classified.message);
      setErrorHint(classified.hint);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndContinue = async () => {
    setIsSaving(true);
    setError(null);
    setErrorHint(null);
    try {
      const conn: SavedConnection = {
        id: crypto.randomUUID(),
        name: name || config.host,
        config,
      };
      await saveConnection(conn);
      onNext();
    } catch (err) {
      const classified = classifyError(err);
      setError(classified.message);
      setErrorHint(classified.hint);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    // Clear ALL draft data including passwords
    setName("");
    setConfig({ ...DEFAULT_CONNECTION_CONFIG });
    setTestResult(null);
    setError(null);
    setErrorHint(null);
    onSkip();
  };

  const isSqlite = config.dbType === "sqlite";
  const isMongodb = config.dbType === "mongodb";
  const isRedis = config.dbType === "redis";
  const placeholders = DB_PLACEHOLDERS[config.dbType] ?? { user: "", database: "" };

  return (
    <OnboardingStep
      currentStep={1}
      totalSteps={3}
      onBack={onBack}
      onSkip={handleSkip}
      primaryAction={
        <button
          type="button"
          onClick={() => void handleSaveAndContinue()}
          disabled={isSaving}
          className="rounded bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          {isSaving ? "Saving..." : t("onboarding.addConnection.saveAndContinue")}
        </button>
      }
    >
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-text-primary">
            {t("onboarding.addConnection.title")}
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            {t("onboarding.addConnection.subtitle")}
          </p>
        </div>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Database"
            className={inputCls}
          />
        </Field>

        <Field label="Type">
          <select
            value={config.dbType}
            onChange={(e) => updateConfig({ dbType: e.target.value })}
            className={inputCls}
          >
            {DB_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        {isSqlite ? (
          <Field label="Database File">
            <input
              value={config.database}
              onChange={(e) => updateConfig({ database: e.target.value })}
              placeholder={placeholders.database}
              className={inputCls}
            />
          </Field>
        ) : isMongodb ? (
          <>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={config.useSrv ?? false}
                  onChange={(e) => updateConfig({ useSrv: e.target.checked })}
                />
                Use SRV (mongodb+srv://)
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Field label="Host">
                  <input value={config.host} onChange={(e) => updateConfig({ host: e.target.value })} placeholder="localhost" className={inputCls} />
                </Field>
              </div>
              <Field label="Port">
                <input type="number" value={config.port} onChange={(e) => updateConfig({ port: Number(e.target.value) })} className={inputCls} disabled={config.useSrv} />
              </Field>
            </div>
            <Field label="Database">
              <input value={config.database} onChange={(e) => updateConfig({ database: e.target.value })} placeholder={placeholders.database} className={inputCls} />
            </Field>
            <Field label="User">
              <input value={config.user} onChange={(e) => updateConfig({ user: e.target.value })} placeholder={placeholders.user} className={inputCls} />
            </Field>
            <Field label="Password">
              <input type="password" value={config.password} onChange={(e) => updateConfig({ password: e.target.value })} className={inputCls} />
            </Field>
          </>
        ) : isRedis ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Field label="Host">
                  <input value={config.host} onChange={(e) => updateConfig({ host: e.target.value })} placeholder="localhost" className={inputCls} />
                </Field>
              </div>
              <Field label="Port">
                <input type="number" value={config.port} onChange={(e) => updateConfig({ port: Number(e.target.value) })} className={inputCls} />
              </Field>
            </div>
            <Field label="Password">
              <input type="password" value={config.password} onChange={(e) => updateConfig({ password: e.target.value })} placeholder="(optional)" className={inputCls} />
            </Field>
            <Field label="Database (0-15)">
              <input value={config.database} onChange={(e) => updateConfig({ database: e.target.value })} placeholder="0" className={inputCls} />
            </Field>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Field label="Host">
                  <input value={config.host} onChange={(e) => updateConfig({ host: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <Field label="Port">
                <input type="number" value={config.port} onChange={(e) => updateConfig({ port: Number(e.target.value) })} className={inputCls} />
              </Field>
            </div>
            <Field label="Database">
              <input value={config.database} onChange={(e) => updateConfig({ database: e.target.value })} placeholder={placeholders.database} className={inputCls} />
            </Field>
            <Field label="User">
              <input value={config.user} onChange={(e) => updateConfig({ user: e.target.value })} placeholder={placeholders.user} className={inputCls} />
            </Field>
            <Field label="Password">
              <input type="password" value={config.password} onChange={(e) => updateConfig({ password: e.target.value })} className={inputCls} />
            </Field>
            <Field label={t("connection.form.sslMode")}>
              <select value={config.sslMode} onChange={(e) => updateConfig({ sslMode: e.target.value })} className={inputCls}>
                {SSL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                {t(sslModeHelpKey(config.dbType, config.sslMode))}
              </p>
            </Field>
            <SshSection config={config} updateConfig={updateConfig} />
          </>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={isTesting}
            className={secondaryBtn}
          >
            {isTesting ? "Testing..." : t("onboarding.addConnection.testConnection")}
          </button>
        </div>

        {testResult && (
          <p className="rounded bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
            {testResult}
          </p>
        )}
        {error && (
          <div className="rounded bg-red-50 px-3 py-2 dark:bg-red-900/20">
            <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            {errorHint && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errorHint}</p>
            )}
          </div>
        )}
      </div>
    </OnboardingStep>
  );
}
