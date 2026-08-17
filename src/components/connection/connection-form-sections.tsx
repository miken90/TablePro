import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectionConfig } from "../../types/connection";
import { listSshHosts, type SshHostEntry } from "../../ipc/commands";
import { inputCls, secondaryBtn } from "./connection-form-config";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

interface SshSectionProps {
  config: ConnectionConfig;
  updateConfig: (partial: Partial<ConnectionConfig>) => void;
}

export function SshSection({ config, updateConfig }: SshSectionProps) {
  const { t } = useTranslation();
  const [sshHosts, setSshHosts] = useState<SshHostEntry[]>([]);
  const [selectedSshHost, setSelectedSshHost] = useState<string>('');

  useEffect(() => {
    if (config.sshEnabled) {
      listSshHosts()
        .then(hosts => setSshHosts(hosts.filter(h => h.hostPattern !== '*')))
        .catch(() => setSshHosts([]));
    }
  }, [config.sshEnabled]);

  const handleSshHostSelect = (hostPattern: string) => {
    setSelectedSshHost(hostPattern);
    if (!hostPattern) return;
    const host = sshHosts.find(h => h.hostPattern === hostPattern);
    if (host) {
      updateConfig({
        sshHost: host.hostname || host.hostPattern,
        ...(host.port ? { sshPort: host.port } : {}),
        ...(host.user ? { sshUser: host.user } : {}),
        ...(host.identityFile ? { sshKeyPath: host.identityFile, sshAuthMethod: 'key' as const } : {}),
      });
    }
  };

  const handlePickKeyFile = async () => {
    let defaultPath: string | undefined;
    try {
      const home = await homeDir();
      defaultPath = `${home}.ssh`;
    } catch {
      // homeDir not available — omit defaultPath
    }
    const path = await openFilePicker({
      defaultPath,
      filters: [
        { name: t("connection.form.sshKeyLabel"), extensions: ["pem", "key", "pub", "ppk", ""] },
        { name: t("connection.form.allFiles"), extensions: ["*"] },
      ],
    });
    if (path) {
      updateConfig({ sshKeyPath: path as string });
    }
  };

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-600">
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
        <span>{t("connection.form.sshTunnel")}</span>
      </button>

      {config.sshEnabled && (
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-3 pb-3 pt-2 dark:border-zinc-600">
          {/* SSH Config Host Picker */}
          {sshHosts.length > 0 && (
            <Field label={t("connection.form.sshConfigHost")}>
              <select
                value={selectedSshHost}
                onChange={(e) => handleSshHostSelect(e.target.value)}
                className={inputCls}
              >
                <option value="">{t("connection.form.sshManualEntry")}</option>
                {sshHosts.map((h) => (
                  <option key={h.hostPattern} value={h.hostPattern}>
                    {h.hostPattern}{h.hostname ? ` (${h.hostname})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* ProxyJump info badge */}
          {selectedSshHost && sshHosts.find(h => h.hostPattern === selectedSshHost)?.proxyJump && (
            <div className="flex items-center gap-1.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              <span className="font-medium">ProxyJump:</span>
              <span>
                {sshHosts.find(h => h.hostPattern === selectedSshHost)!.proxyJump!.split(',').join(' → ')}
              </span>
              <span className="text-[10px] text-amber-500 dark:text-amber-400 ml-1">(informational only)</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label={t("connection.form.sshHost")}>
                <input
                  value={config.sshHost}
                  onChange={(e) => updateConfig({ sshHost: e.target.value })}
                  placeholder="bastion.example.com"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label={t("connection.form.sshPort")}>
              <input
                type="number"
                value={config.sshPort}
                onChange={(e) => updateConfig({ sshPort: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label={t("connection.form.sshUser")}>
            <input
              value={config.sshUser}
              onChange={(e) => updateConfig({ sshUser: e.target.value })}
              placeholder="ec2-user"
              className={inputCls}
            />
          </Field>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("connection.form.authMethod")}</span>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="sshAuthMethod"
                  value="password"
                  checked={config.sshAuthMethod === "password"}
                  onChange={() => updateConfig({ sshAuthMethod: "password" })}
                />
                Password
              </label>
              <label className="flex cursor-pointer items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="sshAuthMethod"
                  value="key"
                  checked={config.sshAuthMethod === "key"}
                  onChange={() => updateConfig({ sshAuthMethod: "key" })}
                />
                {t("connection.form.privateKey")}
              </label>
            </div>
          </div>

          {config.sshAuthMethod === "password" && (
            <Field label={t("connection.form.sshPassword")}>
              <input
                type="password"
                value={config.sshPassword}
                onChange={(e) => updateConfig({ sshPassword: e.target.value })}
                className={inputCls}
              />
            </Field>
          )}

          {config.sshAuthMethod === "key" && (
            <>
              <Field label={t("connection.form.keyFile")}>
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
              <Field label={t("connection.form.passphrase")}>
                <input
                  type="password"
                  value={config.sshKeyPassphrase}
                  onChange={(e) => updateConfig({ sshKeyPassphrase: e.target.value })}
                  placeholder={t("connection.form.optional")}
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
