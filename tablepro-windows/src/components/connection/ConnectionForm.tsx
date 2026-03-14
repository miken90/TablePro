import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import type { ConnectionConfig, SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";

const DB_TYPES = ["postgres", "mysql", "mssql", "sqlite"];
const SSL_MODES = ["disable", "prefer", "require", "verify-ca", "verify-full"];

interface ConnectionFormProps {
  initial?: SavedConnection;
  onClose: () => void;
}

export function ConnectionForm({ initial, onClose }: ConnectionFormProps) {
  const { saveConnection, connect } = useConnectionStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [config, setConfig] = useState<ConnectionConfig>(
    initial?.config ?? {
      host: "localhost",
      port: 5432,
      user: "",
      password: "",
      database: "",
      dbType: "postgres",
      sslMode: "prefer",
    },
  );
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateConfig = (partial: Partial<ConnectionConfig>) =>
    setConfig((c) => ({ ...c, ...partial }));

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const { testConnection } = await import("../../ipc/commands");
      await testConnection(config);
      setTestResult("Connection test succeeded!");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const id = initial?.id ?? crypto.randomUUID();
      await saveConnection({ id, name: name || config.host, config });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    try {
      const id = initial?.id ?? crypto.randomUUID();
      await saveConnection({ id, name: name || config.host, config });
      await connect(id, config);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {initial ? "Edit Connection" : "New Connection"}
      </h2>

      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My DB" className={inputCls} />
      </Field>

      <Field label="Type">
        <select value={config.dbType} onChange={(e) => updateConfig({ dbType: e.target.value })} className={inputCls}>
          {DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="Host">
            <input value={config.host} onChange={(e) => updateConfig({ host: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Port">
          <input
            type="number"
            value={config.port}
            onChange={(e) => updateConfig({ port: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Database">
        <input value={config.database} onChange={(e) => updateConfig({ database: e.target.value })} className={inputCls} />
      </Field>

      <Field label="User">
        <input value={config.user} onChange={(e) => updateConfig({ user: e.target.value })} className={inputCls} />
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={config.password}
          onChange={(e) => updateConfig({ password: e.target.value })}
          className={inputCls}
        />
      </Field>

      <Field label="SSL Mode">
        <select value={config.sslMode} onChange={(e) => updateConfig({ sslMode: e.target.value })} className={inputCls}>
          {SSL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>

      {testResult && (
        <p className="rounded bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {testResult}
        </p>
      )}
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={handleTest} disabled={isTesting} className={secondaryBtn}>
          {isTesting ? "Testing…" : "Test"}
        </button>
        <div className="flex-1" />
        <button onClick={onClose} className={secondaryBtn}>Cancel</button>
        <button onClick={handleSave} disabled={isSaving} className={secondaryBtn}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button onClick={handleConnect} className={primaryBtn}>Connect</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
const primaryBtn =
  "rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40";
const secondaryBtn =
  "rounded border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40";
