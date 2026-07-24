import type { ClosureRequestStaleNudgeEmailInput } from "@/domain/notifications/ports";

/**
 * PRD §5's stale-request nudge. Plain HTML/text, same reasoning as the
 * other templates for skipping @react-email/*.
 */
export function renderClosureRequestStaleNudgeEmail(input: ClosureRequestStaleNudgeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `A closure request for ${input.estateDisplayName} needs attention`;

  const html = `
    <p>A closure request for a <strong>${escapeHtml(input.assetCategory)}</strong> account on <strong>${escapeHtml(input.estateDisplayName)}</strong> hasn't changed status in ${input.daysSinceLastStatusChange} days.</p>
    <p>It's currently <strong>${escapeHtml(input.status)}</strong>. Take a look and update it, or let it be if it's genuinely still in progress.</p>
    <p><a href="${input.closureRequestUrl}">View the closure request</a></p>
  `.trim();

  const text = [
    `A closure request for a ${input.assetCategory} account on ${input.estateDisplayName} hasn't changed status in ${input.daysSinceLastStatusChange} days.`,
    `It's currently ${input.status}. Take a look and update it, or let it be if it's genuinely still in progress.`,
    `View the closure request: ${input.closureRequestUrl}`,
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
