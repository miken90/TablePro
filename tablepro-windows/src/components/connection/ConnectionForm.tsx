import { useState, useCallback } from "react";
import type { DatabaseConnection, DatabaseType, ConnectionColor } from "../../types";
import { DB_TYPE_DEFAULTS, DEFAULT_SSL_CONFIG, DEFAULT_SSH_CONFIG, CONNECTION_COLORS, DB_TYPE_ICONS } from "../../types";
import { testConnection, getPassword } from "../../utils/api";

const DB_TYPES: { value: DatabaseType; label: string }[] = [
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "sqlite", label: "SQLite" },
];

interface ConnectionFormProps {
  initial?: DatabaseConnection;
  onSave: (conn: DatabaseConnection, password: string) => void;
  onCancel: () => void;
}

function newConnection(): DatabaseConnection {
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "localhost",
    port: 3306,
    database: "",
    username: "root",
    dbType: "mysql",
    sslConfig: { ...DEFAULT_SSL_CONFIG },
    sshConfig: { ...DEFAULT_SSH_CONFIG },
    color: "none",
    tagId: null,
    groupId: null,
    isReadOnly: false,
  };
}

type Tab = "general" | "ssl" | "ssh" | "advanced";

export function ConnectionForm({ initial, onSave, onCancel }: ConnectionFormProps) {
  const [conn, setConn] = useState<DatabaseConnection>(initial ?? newConnection());
  const [password, setPassword] = useState("");
  const [sshPassword, setSshPassword] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [passwordLoaded, setPasswordLoaded] = useState(!initial);

  if (initial && !passwordLoaded) {
    getPassword(initial.id).then((pw) => {
      if (pw) setPassword(pw);
      setPasswordLoaded(true);
    });
  }

  const update = useCallback(
    <K extends keyof DatabaseConnection>(key: K, value: DatabaseConnection[K]) => {
      setConn((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleDbTypeChange = useCallback((dbType: DatabaseType) => {
    const defaults = DB_TYPE_DEFAULTS[dbType];
    setConn((prev) => ({
      ...prev,
      dbType,
      port: defaults.port,
      username: prev.username || defaults.username,
    }));
  }, []);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await testConnection(conn, password, sshPassword);
      setTestResult({ ok: true, msg: "Connection successful!" });
    } catch (err) {
      setTestResult({ ok: false, msg: String(err) });
    } finally {
      setTesting(false);
    }
  }, [conn, password, sshPassword]);

  const handleSave = useCallback(() => {
    const name = conn.name.trim() || `${conn.host}:${conn.port}`;
    onSave({ ...conn, name }, password);
  }, [conn, password, onSave]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "ssl", label: "SSL" },
    { id: "ssh", label: "SSH" },
    { id: "advanced", label: "Advanced" },
  ];

  const inputClass =
    "w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500";
  const labelClass = "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";
  const selectClass =
    "w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-500 dark:text-blue-400"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "general" && (
          <>
            {/* DB Type selector */}
            <div className="flex gap-2">
              {DB_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleDbTypeChange(t.value)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                    conn.dbType === t.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
                  }`}
                >
                  <span>{DB_TYPE_ICONS[t.value]}</span>
                  {t.label}
                </button>
              ))}
            </div>

            <div>
              <label className={labelClass}>Name</label>
              <input
                className={inputClass}
                value={conn.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder={`${conn.host}:${conn.port}`}
              />
            </div>

            {conn.dbType !== "sqlite" ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelClass}>Host</label>
                    <input
                      className={inputClass}
                      value={conn.host}
                      onChange={(e) => update("host", e.target.value)}
                      placeholder="localhost"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Port</label>
                    <input
                      className={inputClass}
                      type="number"
                      value={conn.port}
                      onChange={(e) => update("port", parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Username</label>
                    <input
                      className={inputClass}
                      value={conn.username}
                      onChange={(e) => update("username", e.target.value)}
                      placeholder="root"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <input
                      className={inputClass}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Database</label>
                  <input
                    className={inputClass}
                    value={conn.database}
                    onChange={(e) => update("database", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className={labelClass}>Database File</label>
                <input
                  className={inputClass}
                  value={conn.database}
                  onChange={(e) => update("database", e.target.value)}
                  placeholder="/path/to/database.db"
                />
              </div>
            )}
          </>
        )}

        {activeTab === "ssl" && (
          <>
            <div>
              <label className={labelClass}>SSL Mode</label>
              <select
                className={selectClass}
                value={conn.sslConfig.mode}
                onChange={(e) =>
                  update("sslConfig", { ...conn.sslConfig, mode: e.target.value as typeof conn.sslConfig.mode })
                }
              >
                <option value="disabled">Disabled</option>
                <option value="preferred">Preferred</option>
                <option value="required">Required</option>
                <option value="verify_ca">Verify CA</option>
                <option value="verify_identity">Verify Identity</option>
              </select>
            </div>
            {conn.sslConfig.mode !== "disabled" && (
              <>
                <div>
                  <label className={labelClass}>CA Certificate</label>
                  <input
                    className={inputClass}
                    value={conn.sslConfig.caCertPath}
                    onChange={(e) =>
                      update("sslConfig", { ...conn.sslConfig, caCertPath: e.target.value })
                    }
                    placeholder="/path/to/ca-cert.pem"
                  />
                </div>
                <div>
                  <label className={labelClass}>Client Certificate</label>
                  <input
                    className={inputClass}
                    value={conn.sslConfig.clientCertPath}
                    onChange={(e) =>
                      update("sslConfig", { ...conn.sslConfig, clientCertPath: e.target.value })
                    }
                    placeholder="/path/to/client-cert.pem"
                  />
                </div>
                <div>
                  <label className={labelClass}>Client Key</label>
                  <input
                    className={inputClass}
                    value={conn.sslConfig.clientKeyPath}
                    onChange={(e) =>
                      update("sslConfig", { ...conn.sslConfig, clientKeyPath: e.target.value })
                    }
                    placeholder="/path/to/client-key.pem"
                  />
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "ssh" && (
          <>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={conn.sshConfig.enabled}
                onChange={(e) =>
                  update("sshConfig", { ...conn.sshConfig, enabled: e.target.checked })
                }
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              Enable SSH Tunnel
            </label>
            {conn.sshConfig.enabled && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelClass}>SSH Host</label>
                    <input
                      className={inputClass}
                      value={conn.sshConfig.host}
                      onChange={(e) =>
                        update("sshConfig", { ...conn.sshConfig, host: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>SSH Port</label>
                    <input
                      className={inputClass}
                      type="number"
                      value={conn.sshConfig.port}
                      onChange={(e) =>
                        update("sshConfig", {
                          ...conn.sshConfig,
                          port: parseInt(e.target.value) || 22,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>SSH Username</label>
                  <input
                    className={inputClass}
                    value={conn.sshConfig.username}
                    onChange={(e) =>
                      update("sshConfig", { ...conn.sshConfig, username: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Auth Method</label>
                  <select
                    className={selectClass}
                    value={conn.sshConfig.authMethod}
                    onChange={(e) =>
                      update("sshConfig", {
                        ...conn.sshConfig,
                        authMethod: e.target.value as "password" | "privatekey",
                      })
                    }
                  >
                    <option value="password">Password</option>
                    <option value="privatekey">Private Key</option>
                  </select>
                </div>
                {conn.sshConfig.authMethod === "password" ? (
                  <div>
                    <label className={labelClass}>SSH Password</label>
                    <input
                      className={inputClass}
                      type="password"
                      value={sshPassword}
                      onChange={(e) => setSshPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Private Key Path</label>
                    <input
                      className={inputClass}
                      value={conn.sshConfig.privateKeyPath}
                      onChange={(e) =>
                        update("sshConfig", { ...conn.sshConfig, privateKeyPath: e.target.value })
                      }
                      placeholder="~/.ssh/id_rsa"
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "advanced" && (
          <>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={conn.isReadOnly}
                onChange={(e) => update("isReadOnly", e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              Read-only mode
            </label>

            <div>
              <label className={labelClass}>Color</label>
              <div className="flex gap-2 flex-wrap">
                {CONNECTION_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => update("color", c.value as ConnectionColor)}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      conn.color === c.value ? "border-white scale-110" : "border-zinc-300 dark:border-zinc-600"
                    }`}
                    style={{
                      backgroundColor: c.hex === "transparent" ? "#27272a" : c.hex,
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mx-4 mb-2 rounded-md px-3 py-2 text-sm ${
            testResult.ok ? "bg-green-50 text-green-700 dark:bg-green-900/50 dark:text-green-300" : "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-300"
          }`}
        >
          {testResult.msg}
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
