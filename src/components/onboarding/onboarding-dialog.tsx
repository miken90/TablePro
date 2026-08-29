import { useState, useCallback, useEffect } from "react";
import { WelcomeStep } from "./welcome-step";
import { AddConnectionStep } from "./add-connection-step";
import { QuickStartStep } from "./quick-start-step";

interface OnboardingDialogProps {
  onComplete: () => void;
}

export function OnboardingDialog({ onComplete }: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const goTo = useCallback((nextStep: number) => {
    setDirection(nextStep > step ? "forward" : "backward");
    setStep(nextStep);
  }, [step]);

  const handleSkipAll = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Keyboard: Escape to skip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSkipAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSkipAll]);

  return (
    <div
      className="fixed inset-0 z-modal-scrim flex items-center justify-center bg-scrim backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding"
    >
      <div
        className="relative h-[560px] w-[520px] overflow-hidden rounded-xl border border-border-subtle bg-surface-base shadow-modal onboarding-slide-in"
      >
        <div
          key={step}
          className={`h-full ${direction === "forward" ? "onboarding-enter-forward" : "onboarding-enter-backward"}`}
        >
          {step === 0 && (
            <WelcomeStep
              onNext={() => goTo(1)}
              onSkip={handleSkipAll}
            />
          )}
          {step === 1 && (
            <AddConnectionStep
              onNext={() => goTo(2)}
              onBack={() => goTo(0)}
              onSkip={handleSkipAll}
            />
          )}
          {step === 2 && (
            <QuickStartStep
              onBack={() => goTo(1)}
              onDone={onComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
