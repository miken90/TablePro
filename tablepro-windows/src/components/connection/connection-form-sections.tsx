import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import type { ReactNode } from "react";
import type { ConnectionConfig } from "../../types/connection";
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
        <span>SSH Tunnel</span>
      </button>

      {config.sshEnabled && (
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-3 pb-3 pt-2 dark:border-zinc-600">
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

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Auth Method</span>
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
                Private Key
              </label>
            </div>
          </div>

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
