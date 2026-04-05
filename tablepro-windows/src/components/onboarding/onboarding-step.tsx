import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface OnboardingStepProps {
  currentStep: number;
  totalSteps: number;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  /** Custom primary button to replace the default Next */
  primaryAction?: ReactNode;
  /** Hide the skip button (e.g. on last step) */
  hideSkip?: boolean;
}

export function OnboardingStep({
  currentStep,
  totalSteps,
  children,
  onBack,
  onNext,
  onSkip,
  primaryAction,
  hideSkip = false,
}: OnboardingStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        {children}
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle px-6 py-4">
        {/* Left: Skip */}
        <div className="w-28">
          {!hideSkip && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {t("onboarding.steps.skip")}
            </button>
          )}
        </div>

        {/* Center: Step dots */}
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label={t("onboarding.steps.stepOf", { current: currentStep + 1, total: totalSteps })}
        >
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? "scale-125 bg-accent-blue"
                  : "bg-zinc-300 dark:bg-zinc-600"
              }`}
              aria-current={i === currentStep ? "step" : undefined}
            />
          ))}
        </div>

        {/* Right: Back / Next */}
        <div className="flex w-28 items-center justify-end gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {t("onboarding.steps.back")}
            </button>
          )}
          {primaryAction ?? (onNext && (
            <button
              type="button"
              onClick={onNext}
              className="rounded bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-blue-700 transition-colors"
            >
              {t("onboarding.steps.next")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
