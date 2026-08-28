import { useCallback, useEffect, useState } from "react";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { X, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { exportConnections } from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";
import type { SavedConnection } from "../../types/connection";

interface ConnectionExportDialogProps {
  connections: SavedConnection[];
  preSelectedIds: string[];
  onClose: () => void;
}

export function ConnectionExportDialog({
  connections,
  preSelectedIds,
  onClose,
}: ConnectionExportDialogProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(preSelectedIds),
  );
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === connections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(connections.map((c) => c.id)));
    }
  }, [selectedIds.size, connections]);

  const passphraseValid =
    !includeCredentials ||
    (passphrase.length >= 8 && passphrase === confirmPassphrase);

  const canExport = selectedIds.size > 0 && passphraseValid && !exporting;

  const handleExport = useCallback(async () => {
    const filePath = await dialogSave({
      defaultPath: `connections.tablepro`,
      filters: [{ name: "TablePro Connection Export", extensions: ["tablepro"] }],
    });
    if (!filePath) return;

    setExporting(true);
    try {
      await exportConnections(
        Array.from(selectedIds),
        filePath,
        includeCredentials,
        includeCredentials && passphrase ? passphrase : undefined,
      );
      onClose();
    } catch (err) {
      console.error("Export failed:", extractErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }, [selectedIds, includeCredentials, passphrase, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[440px] rounded-lg border border-border bg-surface-base shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("connection.export.title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Connection list */}
        <div className="max-h-[280px] overflow-y-auto px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {selectedIds.size} / {connections.length} selected
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-accent-blue hover:underline"
            >
              {selectedIds.size === connections.length
                ? t("connection.export.deselectAll")
                : t("connection.export.selectAll")}
            </button>
          </div>
          <div className="space-y-1">
            {connections.map((conn) => (
              <label
                key={conn.id}
                className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(conn.id)}
                  onChange={() => toggleId(conn.id)}
                  className="accent-accent-blue"
                />
                <span className="truncate text-xs text-text-primary">
                  {conn.name}
                </span>
                <span className="ml-auto truncate text-xs text-text-secondary group-hover:text-text-primary">
                  {conn.config.host}:{conn.config.port}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Credentials option */}
        <div className="border-t border-border px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includeCredentials}
              onChange={(e) => setIncludeCredentials(e.target.checked)}
              className="accent-accent-blue"
            />
            <Lock size={12} className="text-text-muted" />
            <span className="text-xs text-text-primary">
              {t("connection.export.includeCredentials")}
            </span>
          </label>
          {includeCredentials && (
            <div className="mt-2 space-y-2 pl-6">
              <p className="text-xs text-text-secondary">
                {t("connection.export.credentialWarning")}
              </p>
              <input
                type="password"
                placeholder={t("connection.export.passphrase")}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full rounded border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary"
              />
              <input
                type="password"
                placeholder={t("connection.export.confirmPassphrase")}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                className="w-full rounded border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary"
              />
              {passphrase.length > 0 && passphrase.length < 8 && (
                <p className="text-xs text-amber-400">
                  {t("connection.export.passphraseMinLength")}
                </p>
              )}
              {confirmPassphrase.length > 0 &&
                passphrase !== confirmPassphrase && (
                  <p className="text-xs text-red-400">
                    {t("connection.export.passphraseMismatch")}
                  </p>
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport}
            className="rounded bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {exporting ? t("common.loading") : t("common.export")}
          </button>
        </div>
      </div>
    </div>
  );
}
