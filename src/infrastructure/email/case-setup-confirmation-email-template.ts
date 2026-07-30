import type { CaseSetupConfirmationEmailInput } from "@/domain/notifications/ports";

/** PRD v2 §3.2/§6, US-2.5. Plain HTML/text, same reasoning as the other templates for skipping @react-email/*. */
export function renderCaseSetupConfirmationEmail(input: CaseSetupConfirmationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${input.caseDisplayName} is set up on AfterVault`;

  const html = `
    <p>Setup is complete for <strong>${escapeHtml(input.caseDisplayName)}</strong>.</p>
    <p>You can come back anytime to add accounts, upload documents, or invite an Executor.</p>
    <p><a href="${input.caseUrl}">Go to your Case</a></p>
  `.trim();

  const text = [
    `Setup is complete for ${input.caseDisplayName}.`,
    "You can come back anytime to add accounts, upload documents, or invite an Executor.",
    `Go to your Case: ${input.caseUrl}`,
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
