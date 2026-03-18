import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import type { ConnectionConfig, SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";
import {
  DB_PLACEHOLDERS,
  DB_TYPES,
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_PORTS,
  SSL_MODES,
  inputCls,
  primaryBtn,
  secondaryBtn,
} from "./connection-form-config";
import { Field, SshSection } from "./connection-form-sections";

interface ConnectionFormProps {
  initial?: SavedConnection;
  onClose: () => void;
}

export function ConnectionForm({ initial, onClose }: ConnectionFormProps) {
  const { saveConnection, connect, groups } = useConnectionStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [groupId, setGroupId] = useState<string>(initial?.groupId ?? "");
  const [config, setConfig] = useState<ConnectionConfig>(
    initial?.config ?? DEFAULT_CONNECTION_CONFIG,
  );
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateConfig = (partial: Partial<ConnectionConfig>) =>
    setConfig((c) => {
      const next = { ...c, ...partial };
      if (partial.dbType && partial.dbType !== c.dbType && !initial) {
        next.port = DEFAULT_PORTS[partial.dbType] ?? 5432;
      }
      return next;
    });

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

  const buildConnection = (): SavedConnection => ({
    id: initial?.id ?? crypto.randomUUID(),
    name: name || config.host,
    config,
    groupId: groupId || undefined,
  });

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await saveConnection(buildConnection());
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
      const conn = buildConnection();
      await saveConnection(conn);
      await connect(conn.id, config);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const isSqlite = config.dbType === "sqlite";
  const placeholders = DB_PLACEHOLDERS[config.dbType] ?? { user: "", database: "" };
  const groupList = Array.from(groups.values()).sort((a, b) => a.order - b.order);

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

      {isSqlite ? (
        <Field label="Database File">
          <input value={config.database} onChange={(e) => updateConfig({ database: e.target.value })} placeholder={placeholders.database} className={inputCls} />
        </Field>
      ) : (
        <>
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
            <input value={config.database} onChange={(e) => updateConfig({ database: e.target.value })} placeholder={placeholders.database} className={inputCls} />
          </Field>

          <Field label="User">
            <input value={config.user} onChange={(e) => updateConfig({ user: e.target.value })} placeholder={placeholders.user} className={inputCls} />
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

          {/* SSH Tunnel section */}
          <SshSection config={config} updateConfig={updateConfig} />
        </>
      )}

      {groupList.length > 0 && (
        <Field label="Group">
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
            <option value="">— No group —</option>
            {groupList.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </Field>
      )}

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


