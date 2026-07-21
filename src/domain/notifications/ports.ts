/**
 * Notification domain contracts. Framework-free, same rationale as the
 * other ports.ts files. Covers only the nomination-invite email for now
 * (Milestone 1 feature 6, PRD §5's notification table) — other
 * notification types are later milestones.
 */

export type InvitableRole = "executor" | "helper";

export interface NominationInviteEmailInput {
  toEmail: string;
  estateDisplayName: string;
  role: InvitableRole;
  inviteUrl: string;
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
}
