/**
 * Notification domain contracts. Framework-free, same rationale as the
 * other ports.ts files. Covers the nomination-invite email (Milestone 1
 * feature 6) and the death-verification notice (Milestone 2 feature 3,
 * Security Architecture §4.2) — other notification types are later
 * milestones.
 */

/** Only "executor" is invitable — see the same type in @/domain/membership/ports.ts for why. */
export type InvitableRole = "executor";

export interface NominationInviteEmailInput {
  toEmail: string;
  estateDisplayName: string;
  role: InvitableRole;
  inviteUrl: string;
}

/**
 * §4.2 also calls for SMS "if a phone number is on file" — not implemented:
 * there is no phone-number field on users and no SMS provider configured
 * anywhere in this codebase (TECH_STACK.md, env.ts, package.json all have
 * nothing). Deliberately not stubbed here; needs its own provider decision
 * (e.g. Twilio) before it can be added, not silently substituted.
 */
export interface DeathVerificationNoticeEmailInput {
  toEmail: string;
  estateDisplayName: string;
  selfCancelWindowDays: number;
  selfCancelUrl: string;
}

/** Milestone 2 feature 8's stale-closure-request nudge (PRD §5). */
export interface ClosureRequestStaleNudgeEmailInput {
  toEmail: string;
  estateDisplayName: string;
  assetCategory: string;
  status: string;
  daysSinceLastStatusChange: number;
  closureRequestUrl: string;
}

/** PRD v2 §3.2/§6, US-2.5 — sent on the draft -> active_living transition (onboarding completion), not on Case creation itself. */
export interface CaseSetupConfirmationEmailInput {
  toEmail: string;
  caseDisplayName: string;
  caseUrl: string;
}

/** US-6.4 — recipient is the platform's own bereavement_contact_email, not a case member. `content` is the letter's own text, possibly edited by the Family member (US-6.3) beyond what auto-fill produced. */
export interface NotificationLetterEmailInput {
  toEmail: string;
  subject: string;
  content: string;
}

export interface EmailSender {
  /**
   * Best-effort by design: the invite row and its shareable link already
   * exist by the time this is called (Milestone 1 feature 5) — a failed or
   * unconfigured send must never fail invite creation itself, only surface
   * that the Owner needs to share the link manually. Returns whether a
   * send was actually attempted/succeeded, never throws.
   */
  sendNominationInviteEmail(input: NominationInviteEmailInput): Promise<boolean>;

  /**
   * Best-effort, same rationale: a failed/unconfigured send must never
   * block the death_reported/verifying transition, which has already
   * happened by the time this is called. The audit_logs
   * verification_notice_sent event records the outcome regardless.
   */
  sendDeathVerificationNoticeEmail(input: DeathVerificationNoticeEmailInput): Promise<boolean>;

  /**
   * Best-effort, same rationale: a failed/unconfigured send must never
   * block the stale-request sweep, which has already marked the request
   * nudged (mark_stale_closure_requests_needing_nudge) by the time this is
   * called.
   */
  sendClosureRequestStaleNudgeEmail(input: ClosureRequestStaleNudgeEmailInput): Promise<boolean>;

  /**
   * Best-effort, same rationale: a failed/unconfigured send must never
   * block onboarding completion, which has already happened (draft ->
   * active_living, via activate_draft_case()) by the time this is called.
   */
  sendCaseSetupConfirmationEmail(input: CaseSetupConfirmationEmailInput): Promise<boolean>;

  /**
   * Best-effort, same rationale: a failed/unconfigured send must never
   * block letter finalization, which has already happened (the PDF is
   * already generated and stored) by the time this is called.
   */
  sendNotificationLetterEmail(input: NotificationLetterEmailInput): Promise<boolean>;
}
