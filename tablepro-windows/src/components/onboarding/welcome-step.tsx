import { useTranslation } from "react-i18next";
import { OnboardingStep } from "./onboarding-step";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

const FEATURES = [
  { key: "multiDb", icon: "cylinder" },
  { key: "editor", icon: "code" },
  { key: "grid", icon: "table" },
  { key: "secure", icon: "shield" },
  { key: "ai", icon: "sparkles" },
] as const;

const FEATURE_ICONS: Record<string, string> = {
  cylinder: "M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  table: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  sparkles: "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z",
};

function FeatureIcon({ icon }: { icon: string }) {
  const path = FEATURE_ICONS[icon];
  return (
    <svg
      className="h-5 w-5 text-accent-blue flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  const { t } = useTranslation();

  return (
    <OnboardingStep currentStep={0} totalSteps={3} onSkip={onSkip}>
      <div className="flex flex-col items-center gap-6 max-w-md">
        {/* App icon placeholder */}
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-accent-blue/10">
          <svg className="h-10 w-10 text-accent-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v18H3zM3 9h18M9 3v18" />
          </svg>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">
            {t("onboarding.welcome.title")}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {t("onboarding.welcome.subtitle")}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          {FEATURES.map(({ key, icon }) => (
            <div key={key} className="flex items-start gap-3">
              <FeatureIcon icon={icon} />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t(`onboarding.welcome.features.${key}`)}
                </p>
                <p className="text-xs text-text-secondary">
                  {t(`onboarding.welcome.features.${key}Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onNext}
          className="mt-2 rounded bg-accent-blue px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {t("onboarding.welcome.getStarted")}
        </button>
      </div>
    </OnboardingStep>
  );
}
