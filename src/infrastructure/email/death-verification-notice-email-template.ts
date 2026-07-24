import type { DeathVerificationNoticeEmailInput } from "@/domain/notifications/ports";

/**
 * The false-positive-sensitive notice (Security Architecture §4.2) — fires
 * the moment an estate enters `verifying`, whether from a proactive report
 * or the automated check-in-based escalation. Plain HTML/text, same
 * reasoning as the nomination-invite template for skipping @react-email/*.
 */
export function renderDeathVerificationNoticeEmail(input: DeathVerificationNoticeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Action needed: a death report was filed for ${input.estateDisplayName}`;

  const html = `
    <p>We received a report that you may have passed away, for your AfterVault estate <strong>${escapeHtml(input.estateDisplayName)}</strong>.</p>
    <p>If this is not correct, log in and confirm you're alive within <strong>${input.selfCancelWindowDays} days</strong> to cancel this report and resume normal check-ins.</p>
    <p><a href="${input.selfCancelUrl}">Confirm you're alive</a></p>
    <p style="color: #666; font-size: 13px;">If you take no action within the window, your estate will move to the next stage of the verification process, which requires a certified death certificate before anyone gains access to your vault.</p>
  `.trim();

  const text = [
    `We received a report that you may have passed away, for your AfterVault estate ${input.estateDisplayName}.`,
    `If this is not correct, log in and confirm you're alive within ${input.selfCancelWindowDays} days to cancel this report and resume normal check-ins.`,
    `Confirm you're alive: ${input.selfCancelUrl}`,
    "If you take no action within the window, your estate will move to the next stage of the verification process, which requires a certified death certificate before anyone gains access to your vault.",
  ].join("\n\n");

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
