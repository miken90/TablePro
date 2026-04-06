import { useTranslation } from "react-i18next";
import { OnboardingStep } from "./onboarding-step";

interface QuickStartStepProps {
  onBack: () => void;
  onDone: () => void;
}

const SHORTCUTS = [
  { key: "execute", shortcut: "Ctrl+Enter" },
  { key: "commandPalette", shortcut: "Ctrl+K" },
  { key: "explain", shortcut: "Ctrl+Shift+X" },
] as const;

export function QuickStartStep({ onBack, onDone }: QuickStartStepProps) {
  const { t } = useTranslation();

  return (
    <OnboardingStep
      currentStep={2}
      totalSteps={3}
      onBack={onBack}
      hideSkip
      primaryAction={
        <button
          type="button"
          onClick={onDone}
          className="rounded bg-accent-blue px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {t("onboarding.quickStart.done")}
        </button>
      }
    >
      <div className="flex flex-col items-center gap-6 max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-8 w-8 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-text-primary">
            {t("onboarding.quickStart.title")}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {t("onboarding.quickStart.subtitle")}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          {SHORTCUTS.map(({ key, shortcut }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3"
            >
              <span className="text-sm text-text-primary">
                {t(`onboarding.quickStart.shortcuts.${key}`)}
              </span>
              <kbd className="rounded bg-surface-elevated px-2 py-1 text-xs font-mono text-text-secondary border border-border-subtle">
                {shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </OnboardingStep>
  );
}
