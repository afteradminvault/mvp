/**
 * Notification domain contracts. Framework-free, same rationale as the
 * other ports.ts files. Covers the nomination-invite email (Milestone 1
 * feature 6) and the death-verification notice (Milestone 2 feature 3,
 * Security Architecture §4.2) — other notification types are later
 * milestones.
 */

export type InvitableRole = "executor" | "helper";

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
}
