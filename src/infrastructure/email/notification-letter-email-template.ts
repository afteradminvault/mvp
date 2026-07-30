import type { NotificationLetterEmailInput } from "@/domain/notifications/ports";

/** US-6.4. Plain HTML/text, same reasoning as the other templates for skipping @react-email/*. `content` is arbitrary (possibly Family-edited) text — paragraphs are its blank-line-separated blocks. */
export function renderNotificationLetterEmail(input: NotificationLetterEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const paragraphs = input.content.split("\n\n");

  const html = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("\n");

  return { subject: input.subject, html, text: input.content };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
