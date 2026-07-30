import type { NominationInviteEmailInput } from "@/domain/notifications/ports";

/**
 * Plain HTML/text template — no @react-email/* dependency added for one
 * template (Tech Stack doc mentions React Email as a nice-to-have
 * companion approach, not a requirement). Revisit if/when the
 * notification set grows enough to justify the dependency.
 */
export function renderNominationInviteEmail(input: NominationInviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  // Only "executor" is invitable (PRD v2 §0/§8 Q3 — the view-only Helper
  // role was dropped, folded into "family"), so this no longer branches
  // on input.role — kept as a parameter for API stability, not because
  // there's a second case to render.
  const roleLabel = "Executor";
  const subject = `You've been nominated as ${roleLabel} on AfterVault`;
  const roleExplanation =
    "As Executor, you'll be responsible for carrying out their wishes and accessing their digital vault once their passing is verified.";

  const html = `
    <p>You've been nominated as <strong>${roleLabel}</strong> for <strong>${escapeHtml(input.estateDisplayName)}</strong> on AfterVault.</p>
    <p>${roleExplanation}</p>
    <p><a href="${input.inviteUrl}">Accept this nomination</a></p>
    <p style="color: #666; font-size: 13px;">This link is single-use and expires in 14 days. If you weren't expecting this, you can ignore it.</p>
  `.trim();

  const text = [
    `You've been nominated as ${roleLabel} for ${input.estateDisplayName} on AfterVault.`,
    roleExplanation,
    `Accept this nomination: ${input.inviteUrl}`,
    "This link is single-use and expires in 14 days. If you weren't expecting this, you can ignore it.",
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
