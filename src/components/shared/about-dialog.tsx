import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

declare const __APP_VERSION__: string;

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * About box — name, build version and host platform.
 *
 * Opened by the `app.about` command, so it is reachable from the command
 * palette and from the shortcut it registers.
 */
export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-[380px] rounded-lg border border-border bg-surface-elevated p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="TablePro"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          aria-label={t("common.close")}
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">TablePro</h2>
          <p className="text-sm text-text-secondary">
            {t("about.version", { version: __APP_VERSION__ })}
          </p>
          <p className="text-center text-xs text-text-muted">{t("about.description")}</p>
          <p className="w-full border-t border-border-subtle pt-3 text-center text-xs text-text-muted">
            {t("about.platform")}: {navigator.platform}
          </p>
        </div>
      </div>
    </div>
  );
}
