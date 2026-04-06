import { Download, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AvailableUpdate } from "../../hooks/useAutoUpdater";

interface UpdateNotificationProps {
  update: AvailableUpdate;
  isInstalling: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  onUpdateNow: () => void;
  onLater: () => void;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function progressPercent(downloadedBytes: number, totalBytes: number | null): number | null {
  if (!totalBytes || totalBytes <= 0) return null;
  return Math.max(0, Math.min(100, (downloadedBytes / totalBytes) * 100));
}

export function UpdateNotification({
  update,
  isInstalling,
  downloadedBytes,
  totalBytes,
  error,
  onUpdateNow,
  onLater,
}: UpdateNotificationProps) {
  const { t } = useTranslation();
  const progress = progressPercent(downloadedBytes, totalBytes);

  return (
    <div className="fixed right-4 top-4 z-50 w-[420px] rounded-lg border border-blue-300 bg-white p-4 shadow-lg dark:border-blue-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("update.available", { version: update.version })}
          </h3>
          {update.date && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t("update.published", { date: update.date })}</p>
          )}
        </div>
        <button
          onClick={onLater}
          disabled={isInstalling}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label={t("common.close")}
        >
          <X size={16} />
        </button>
      </div>

      {update.notes && (
        <p className="mb-3 line-clamp-4 text-xs text-zinc-600 dark:text-zinc-300">{update.notes}</p>
      )}

      {isInstalling && (
        <div className="mb-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
          <div className="mb-1 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <RefreshCw size={14} className="animate-spin" />
            <span>{t("update.downloading")}</span>
          </div>
          {progress !== null ? (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {formatBytes(downloadedBytes)} / {formatBytes(totalBytes ?? 0)} ({Math.round(progress)}%)
              </p>
            </>
          ) : (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t("update.downloaded", { bytes: formatBytes(downloadedBytes) })}
            </p>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{t("error.updateFailed", { error })}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onLater}
          disabled={isInstalling}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {t("update.later")}
        </button>
        <button
          onClick={onUpdateNow}
          disabled={isInstalling}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={14} />
          {isInstalling ? t("update.installing") : t("update.updateNow")}
        </button>
      </div>
    </div>
  );
}
