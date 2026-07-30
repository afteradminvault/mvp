/**
 * The onboarding step sequence (PRD v2 §3.2/§3.9, US-2.1–2.4). "profile"
 * (deceased profile, US-2.1) happens at /cases/new, before a case exists
 * at all — it's listed here only so the stepper can show it as the
 * completed first step; there's no /cases/[id]/onboarding/profile page.
 * Death certificate upload (US-2.3) is explicitly optional ("during or
 * after onboarding") — included in the sequence for progress-indicator
 * purposes, but never blocks moving on to Confirm.
 */
export const ONBOARDING_STEPS = [
  { key: "profile", label: "Profile" },
  { key: "checklist", label: "Accounts" },
  { key: "certificate", label: "Death certificate" },
  { key: "confirm", label: "Confirm" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

/** cases.draft_step is null immediately after /cases/new creates the case — that's step 1 ("profile") already done, next stop "checklist". */
export function resolveCurrentStepKey(draftStep: string | null): OnboardingStepKey {
  if (draftStep === null) return "checklist";
  const match = ONBOARDING_STEPS.find((step) => step.key === draftStep);
  return match ? (match.key as OnboardingStepKey) : "checklist";
}
