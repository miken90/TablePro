import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-[400px] rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label={t("common.close")}
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center gap-4">
          <h2 className="text-xl font-semibold text-white">TablePro</h2>
          <p className="text-sm text-neutral-400">{t("about.version", { version: "0.1.0" })}</p>

          <p className="text-center text-xs text-neutral-500">
            {t("about.description")}
          </p>

          <div className="flex gap-4 text-xs text-blue-400">
            <a href="https://tablepro.app" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {t("about.website")}
            </a>
            <a href="https://docs.tablepro.app" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {t("about.documentation")}
            </a>
            <a href="https://github.com/tablepro" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {t("about.github")}
            </a>
          </div>

          <div className="w-full border-t border-neutral-800 pt-3 text-xs text-neutral-500">
            <p>{t("about.platform")}: {navigator.platform}</p>
            <p>{t("about.userAgent")}: {navigator.userAgent.slice(0, 60)}...</p>
          </div>

          <p className="text-xs text-neutral-600">{t("about.copyright")}</p>
        </div>
      </div>
    </div>
  );
}
