import { ONBOARDING_STEPS, type OnboardingStepKey } from "./steps";

/**
 * The shared progress indicator (US-2.2's "Stepper/progress indicator,
 * shared component"). Purely presentational — no navigation logic, no
 * links to steps not yet reachable, since onboarding here is strictly
 * linear (each step's own page decides where "next" goes).
 */
export function OnboardingStepper({ currentStepKey }: { currentStepKey: OnboardingStepKey }) {
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === currentStepKey);

  return (
    <ol className="mb-8 flex items-center" aria-label="Onboarding progress">
      {ONBOARDING_STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  isComplete
                    ? "bg-black text-white"
                    : isCurrent
                      ? "border-2 border-black text-black"
                      : "border border-gray-300 text-gray-400"
                }`}
              >
                {isComplete ? "✓" : index + 1}
              </span>
              <span className={`text-xs ${isCurrent ? "font-medium text-black" : "text-gray-500"}`}>
                {step.label}
              </span>
            </div>
            {index < ONBOARDING_STEPS.length - 1 && (
              <div className={`mx-2 h-px flex-1 ${isComplete ? "bg-black" : "bg-gray-300"}`} aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
