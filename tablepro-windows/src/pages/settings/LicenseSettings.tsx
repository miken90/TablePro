import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LicenseInfo {
  key: string;
  email: string;
  status: string;
  plan: string;
  machineId: string;
  activatedAt: string;
  expiresAt: string | null;
  lastValidatedAt: string;
}

export function LicenseSettings() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadLicense();
  }, []);

  const loadLicense = async () => {
    try {
      const info = await invoke<LicenseInfo>("get_license_info");
      setLicense(info);
    } catch {
      // unlicensed state
    }
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      const info = await invoke<LicenseInfo>("activate_license", {
        license_key: licenseKey,
      });
      setLicense(info);
      setLicenseKey("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("deactivate_license");
      setLicense(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const info = await invoke<LicenseInfo>("check_license");
      setLicense(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const isActive =
    license?.status === "active" || license?.status === "trial";

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">License</h3>

      {isActive && license ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-800 bg-green-900/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-400">
                {license.status === "trial" ? "Trial Active" : "License Active"}
              </span>
            </div>
            <div className="space-y-1 text-sm text-zinc-400">
              <p>Email: {license.email}</p>
              <p>Plan: {license.plan}</p>
              <p>
                Key: {license.key.slice(0, 8)}…{license.key.slice(-4)}
              </p>
              {license.expiresAt && (
                <p>
                  Expires:{" "}
                  {new Date(license.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCheck}
              disabled={loading}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Verify License"}
            </button>
            <button
              onClick={handleDeactivate}
              disabled={loading}
              className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition hover:bg-red-900/30 disabled:opacity-50"
            >
              Deactivate
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {license && license.status !== "unlicensed" && (
            <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 p-3">
              <span className="text-sm text-yellow-400">
                Status: {license.status}
              </span>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-zinc-300">
              License Key
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="input-field flex-1 font-mono"
              />
              <button
                onClick={handleActivate}
                disabled={loading || !licenseKey.trim()}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}
