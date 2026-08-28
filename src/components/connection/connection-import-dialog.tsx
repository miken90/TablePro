import { useCallback, useEffect, useState } from "react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { X, AlertTriangle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  importConnectionsPreview,
  confirmImport,
} from "../../ipc/commands";
import type {
  ImportPreviewItem,
  ImportPreviewResponse,
  ImportResolutionEntry,
} from "../../ipc/commands";
import { extractErrorMessage } from "../../ipc/error";

interface ConnectionImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = "file" | "passphrase" | "preview";

export function ConnectionImportDialog({
  onClose,
  onImported,
}: ConnectionImportDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("file");
  const [filePath, setFilePath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [resolutions, setResolutions] = useState<Map<number, string>>(
    new Map(),
  );
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Auto-open file picker on mount
  useEffect(() => {
    void pickFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFile = useCallback(async () => {
    const path = await dialogOpen({
      filters: [
        { name: "TablePro Connection Export", extensions: ["tablepro"] },
      ],
      multiple: false,
    });
    if (!path) {
      onClose();
      return;
    }
    const selected = typeof path === "string" ? path : path[0];
    setFilePath(selected);
    await loadPreview(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const loadPreview = useCallback(
    async (path: string, pass?: string) => {
      setLoading(true);
      try {
        const data = await importConnectionsPreview(path, pass);
        setPreview(data);
        // Set default resolutions
        const defaults = new Map<number, string>();
        for (const item of data.items) {
          defaults.set(
            item.index,
            item.status === "duplicate" ? "skip" : "import_new",
          );
        }
        setResolutions(defaults);
        setStep("preview");
      } catch (err) {
        const msg = extractErrorMessage(err);
        if (msg.includes("encrypted") || msg.includes("passphrase")) {
          setStep("passphrase");
        } else {
          console.error("Import preview failed:", msg);
          onClose();
        }
      } finally {
        setLoading(false);
      }
    },
    [onClose],
  );

  const handlePassphraseSubmit = useCallback(async () => {
    setPassphraseError("");
    setLoading(true);
    try {
      const data = await importConnectionsPreview(filePath, passphrase);
      setPreview(data);
      const defaults = new Map<number, string>();
      for (const item of data.items) {
        defaults.set(
          item.index,
          item.status === "duplicate" ? "skip" : "import_new",
        );
      }
      setResolutions(defaults);
      setStep("preview");
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (msg.toLowerCase().includes("passphrase") || msg.toLowerCase().includes("incorrect")) {
        setPassphraseError(t("connection.import.wrongPassphrase"));
      } else {
        console.error("Import passphrase failed:", msg);
      }
    } finally {
      setLoading(false);
    }
  }, [filePath, passphrase, t]);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const entries: ImportResolutionEntry[] = Array.from(
        resolutions.entries(),
      ).map(([index, action]) => {
        const item = preview.items.find((i) => i.index === index);
        return {
          index,
          action: action as ImportResolutionEntry["action"],
          existingId: action === "replace" ? item?.existingId : undefined,
        };
      });
      await confirmImport(
        filePath,
        passphrase || undefined,
        entries,
      );
      onImported();
      onClose();
    } catch (err) {
      console.error("Import failed:", extractErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }, [preview, resolutions, filePath, passphrase, onImported, onClose]);

  const setResolution = useCallback((index: number, action: string) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(index, action);
      return next;
    });
  }, []);

  const importCount = Array.from(resolutions.values()).filter(
    (a) => a !== "skip",
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[520px] rounded-lg border border-border bg-surface-base shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("connection.import.title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Passphrase step */}
        {step === "passphrase" && (
          <div className="px-4 py-6">
            <p className="mb-3 text-xs text-text-secondary">
              {t("connection.import.needsPassphrase")}
            </p>
            <input
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passphrase) void handlePassphraseSubmit();
              }}
              className="w-full rounded border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary"
              placeholder={t("connection.export.passphrase")}
            />
            {passphraseError && (
              <p className="mt-1 text-xs text-red-400">{passphraseError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handlePassphraseSubmit}
                disabled={!passphrase || loading}
                className="rounded bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-accent-blue/90 disabled:opacity-50"
              >
                {loading ? t("common.loading") : t("common.ok")}
              </button>
            </div>
          </div>
        )}

        {/* Loading step */}
        {step === "file" && loading && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-text-secondary">{t("common.loading")}</p>
          </div>
        )}

        {/* Preview step */}
        {step === "preview" && preview && (
          <>
            <div className="max-h-[360px] overflow-y-auto px-4 py-3">
              <p className="mb-2 text-xs text-text-secondary">
                {preview.items.length} connection(s) from v{preview.appVersion}
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="pb-1 pr-2">Name</th>
                    <th className="pb-1 pr-2">Host</th>
                    <th className="pb-1 pr-2">Type</th>
                    <th className="pb-1 pr-2">Status</th>
                    <th className="pb-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => (
                    <PreviewRow
                      key={item.index}
                      item={item}
                      resolution={resolutions.get(item.index) ?? "skip"}
                      onChangeResolution={(a) =>
                        setResolution(item.index, a)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleImport}
                disabled={importCount === 0 || importing}
                className="rounded bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-accent-blue/90 disabled:opacity-50"
              >
                {importing
                  ? t("common.loading")
                  : `${t("common.import")} (${importCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewRow({
  item,
  resolution,
  onChangeResolution,
}: {
  item: ImportPreviewItem;
  resolution: string;
  onChangeResolution: (action: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-border/50">
      <td className="max-w-[120px] truncate py-1.5 pr-2 text-text-primary">
        {item.name}
      </td>
      <td className="max-w-[100px] truncate py-1.5 pr-2 text-text-secondary">
        {item.host}
      </td>
      <td className="py-1.5 pr-2 text-text-secondary">{item.dbType}</td>
      <td className="py-1.5 pr-2">
        <StatusBadge status={item.status} warnings={item.warnings} t={t} />
      </td>
      <td className="py-1.5">
        <select
          value={resolution}
          onChange={(e) => onChangeResolution(e.target.value)}
          className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-xs text-text-primary"
        >
          <option value="import_new">
            {t("connection.import.actionImport")}
          </option>
          <option value="skip">{t("connection.import.actionSkip")}</option>
          {item.status === "duplicate" && (
            <>
              <option value="replace">
                {t("connection.import.actionReplace")}
              </option>
              <option value="import_as_copy">
                {t("connection.import.actionImportAsCopy")}
              </option>
            </>
          )}
        </select>
      </td>
    </tr>
  );
}

function StatusBadge({
  status,
  warnings,
  t,
}: {
  status: string;
  warnings: string[];
  t: (key: string) => string;
}) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-green-400">
        <Check size={10} /> {t("connection.import.statusReady")}
      </span>
    );
  }
  if (status === "duplicate") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400">
        <AlertTriangle size={10} /> {t("connection.import.statusDuplicate")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-amber-400"
      title={warnings.join("\n")}
    >
      <AlertTriangle size={10} /> {t("connection.import.statusWarnings")}
    </span>
  );
}
