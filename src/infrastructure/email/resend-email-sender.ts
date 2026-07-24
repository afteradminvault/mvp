import { Resend } from "resend";
import type {
  DeathVerificationNoticeEmailInput,
  EmailSender,
  NominationInviteEmailInput,
} from "@/domain/notifications/ports";
import { renderNominationInviteEmail } from "./nomination-invite-email-template";
import { renderDeathVerificationNoticeEmail } from "./death-verification-notice-email-template";

/**
 * Best-effort by design (see ports.ts) — never throws. If RESEND_API_KEY
 * isn't configured (Milestone 0 scaffolded it as optional; no key has been
 * provided as of this feature), sends are skipped with a clear log line
 * rather than failing the request that triggered them.
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fromAddress: string = "AfterVault <onboarding@resend.dev>",
  ) {}

  async sendNominationInviteEmail(input: NominationInviteEmailInput): Promise<boolean> {
    if (!this.apiKey) {
      console.warn("RESEND_API_KEY is not configured — skipping nomination-invite email send.");
      return false;
    }

    try {
      const resend = new Resend(this.apiKey);
      const { subject, html, text } = renderNominationInviteEmail(input);
      const { error } = await resend.emails.send({
        from: this.fromAddress,
        to: input.toEmail,
        subject,
        html,
        text,
      });
      if (error) {
        console.error("Resend rejected the nomination-invite email:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to send nomination-invite email:", error);
      return false;
    }
  }

  async sendDeathVerificationNoticeEmail(input: DeathVerificationNoticeEmailInput): Promise<boolean> {
    if (!this.apiKey) {
      console.warn("RESEND_API_KEY is not configured — skipping death-verification notice email send.");
      return false;
    }

    try {
      const resend = new Resend(this.apiKey);
      const { subject, html, text } = renderDeathVerificationNoticeEmail(input);
      const { error } = await resend.emails.send({
        from: this.fromAddress,
        to: input.toEmail,
        subject,
        html,
        text,
      });
      if (error) {
        console.error("Resend rejected the death-verification notice email:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to send death-verification notice email:", error);
      return false;
    }
  }
}
