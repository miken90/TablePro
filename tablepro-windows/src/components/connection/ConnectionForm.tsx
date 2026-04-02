import { useState } from "react";
import { useConnectionStore } from "../../stores/connectionStore";
import type { ConnectionConfig, SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";
import { testConnection } from "../../ipc/commands";
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
import { ConnectionColorPicker } from "./connection-color-picker";
import { ConnectionTagPicker } from "./connection-tag-picker";
import { parseConnectionUrl } from "../../utils/connection-url-parser";

interface ConnectionFormProps {
  initial?: SavedConnection;
  onClose: () => void;
}

export function ConnectionForm({ initial, onClose }: ConnectionFormProps) {
  const { saveConnection, connect, groups } = useConnectionStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [groupId, setGroupId] = useState<string>(initial?.groupId ?? "");
  const [color, setColor] = useState<string | undefined>(initial?.color);
  const [tag, setTag] = useState<string | undefined>(initial?.tag);
  const [config, setConfig] = useState<ConnectionConfig>(initial?.config ?? DEFAULT_CONNECTION_CONFIG);
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initial?.config.startupCommands));
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

  const handleImportFromUrl = () => {
    try {
      const parsed = parseConnectionUrl(connectionUrl);
      updateConfig(parsed);
      setError(null);
      setUrlImportOpen(false);
      if (!name && parsed.host) {
        setName(parsed.host);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError(null);
    try {
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
    color,
    tag: tag?.trim() ? tag.trim() : undefined,
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

      <div className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-700">
        <span className="text-xs text-zinc-600 dark:text-zinc-300">Import settings from connection URL</span>
        <button type="button" onClick={() => setUrlImportOpen((v) => !v)} className={secondaryBtn}>
          {urlImportOpen ? "Hide" : "Import from URL"}
        </button>
      </div>

      {urlImportOpen && (
        <div className="flex flex-col gap-2 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          <input
            value={connectionUrl}
            onChange={(e) => setConnectionUrl(e.target.value)}
            placeholder="postgresql://user:pass@host:5432/database"
            className={inputCls}
          />
          <div className="flex justify-end">
            <button type="button" onClick={handleImportFromUrl} className={secondaryBtn}>
              Apply URL
            </button>
          </div>
        </div>
      )}

      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My DB" className={inputCls} />
      </Field>

      <Field label="Color">
        <ConnectionColorPicker value={color} onChange={setColor} />
      </Field>

      <Field label="Tag">
        <ConnectionTagPicker value={tag} onChange={setTag} />
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

      <div className="rounded border border-zinc-200 dark:border-zinc-700">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
        >
          <span>Advanced</span>
          <span>{advancedOpen ? "−" : "+"}</span>
        </button>
        {advancedOpen && (
          <div className="border-t border-zinc-200 p-3 dark:border-zinc-600">
            <Field label="Startup Commands">
              <textarea
                value={config.startupCommands ?? ""}
                onChange={(e) => updateConfig({ startupCommands: e.target.value })}
                placeholder="SET search_path TO public;"
                rows={4}
                className={`${inputCls} min-h-20`}
              />
            </Field>
          </div>
        )}
      </div>

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
