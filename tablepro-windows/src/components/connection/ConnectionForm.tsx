import { useState } from "react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { useConnectionStore } from "../../stores/connectionStore";
import type { ConnectionConfig, SavedConnection } from "../../types/connection";
import { extractErrorMessage } from "../../ipc/error";

const DB_TYPES = ["postgres", "mysql", "mssql", "sqlite"];
const SSL_MODES = ["disable", "prefer", "require", "verify-ca", "verify-full"];

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
};

const DB_PLACEHOLDERS: Record<string, { user: string; database: string }> = {
  postgres: { user: "postgres", database: "postgres" },
  mysql: { user: "root", database: "" },
  mssql: { user: "sa", database: "master" },
  sqlite: { user: "", database: "/path/to/database.db" },
};

interface ConnectionFormProps {
  initial?: SavedConnection;
  onClose: () => void;
}

export function ConnectionForm({ initial, onClose }: ConnectionFormProps) {
  const { saveConnection, connect, groups } = useConnectionStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [groupId, setGroupId] = useState<string>(initial?.groupId ?? "");
  const [config, setConfig] = useState<ConnectionConfig>(
    initial?.config ?? {
      host: "localhost",
      port: 5432,
      user: "",
      password: "",
      database: "",
      dbType: "postgres",
      sslMode: "prefer",
      sshEnabled: false,
      sshHost: "",
      sshPort: 22,
      sshUser: "",
      sshAuthMethod: "password",
      sshPassword: "",
      sshKeyPath: "",
      sshKeyPassphrase: "",
    },
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSH Tunnel section
// ---------------------------------------------------------------------------

interface SshSectionProps {
  config: ConnectionConfig;
  updateConfig: (partial: Partial<ConnectionConfig>) => void;
}

function SshSection({ config, updateConfig }: SshSectionProps) {
  const handlePickKeyFile = async () => {
    const path = await openFilePicker({
      filters: [{ name: "SSH Key", extensions: ["pem", "key", "pub", ""] }],
    });
    if (path) {
      updateConfig({ sshKeyPath: path as string });
    }
  };

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-600">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => updateConfig({ sshEnabled: !config.sshEnabled })}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
      >
        <span
          className={`inline-block h-3.5 w-7 rounded-full transition-colors ${
            config.sshEnabled ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600"
          }`}
        />
        SSH Tunnel
      </button>

      {config.sshEnabled && (
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-3 pb-3 pt-2 dark:border-zinc-600">
          {/* SSH Host + Port */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="SSH Host">
                <input
                  value={config.sshHost}
                  onChange={(e) => updateConfig({ sshHost: e.target.value })}
                  placeholder="bastion.example.com"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="SSH Port">
              <input
                type="number"
                value={config.sshPort}
                onChange={(e) => updateConfig({ sshPort: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="SSH User">
            <input
              value={config.sshUser}
              onChange={(e) => updateConfig({ sshUser: e.target.value })}
              placeholder="ec2-user"
              className={inputCls}
            />
          </Field>

          {/* Auth method selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Auth Method</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="sshAuthMethod"
                  value="password"
                  checked={config.sshAuthMethod === "password"}
                  onChange={() => updateConfig({ sshAuthMethod: "password" })}
                />
                Password
              </label>
              <label className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="sshAuthMethod"
                  value="key"
                  checked={config.sshAuthMethod === "key"}
                  onChange={() => updateConfig({ sshAuthMethod: "key" })}
                />
                Private Key
              </label>
            </div>
          </div>

          {/* Password auth */}
          {config.sshAuthMethod === "password" && (
            <Field label="SSH Password">
              <input
                type="password"
                value={config.sshPassword}
                onChange={(e) => updateConfig({ sshPassword: e.target.value })}
                className={inputCls}
              />
            </Field>
          )}

          {/* Key auth */}
          {config.sshAuthMethod === "key" && (
            <>
              <Field label="Key File">
                <div className="flex gap-1">
                  <input
                    value={config.sshKeyPath}
                    onChange={(e) => updateConfig({ sshKeyPath: e.target.value })}
                    placeholder="/home/user/.ssh/id_rsa"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={handlePickKeyFile}
                    className={secondaryBtn}
                    title="Browse for key file"
                  >
                    …
                  </button>
                </div>
              </Field>
              <Field label="Passphrase">
                <input
                  type="password"
                  value={config.sshKeyPassphrase}
                  onChange={(e) => updateConfig({ sshKeyPassphrase: e.target.value })}
                  placeholder="(optional)"
                  className={inputCls}
                />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
const primaryBtn =
  "rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40";
const secondaryBtn =
  "rounded border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40";
