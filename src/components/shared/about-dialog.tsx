import { useTranslation } from "react-i18next";
import { Dialog } from "../ui";

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

  return (
    <Dialog open={open} onClose={onClose} title="TablePro" size="sm" cancelLabel={t("common.close")}>
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-text-secondary">
          {t("about.version", { version: __APP_VERSION__ })}
        </p>
        <p className="text-center text-xs text-text-secondary">{t("about.description")}</p>
        <p className="w-full border-t border-border-subtle pt-3 text-center text-xs text-text-secondary">
          {t("about.platform")}: {navigator.platform}
        </p>
      </div>
    </Dialog>
  );
}
