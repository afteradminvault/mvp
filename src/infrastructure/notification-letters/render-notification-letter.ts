import type { NotificationLetterType } from "@/domain/notification-letters/ports";

/**
 * US-6.1/6.2 — the auto-fill itself. Plain text (not HTML), matching the
 * story's own "Inline plain-text or light rich-text editor" AC and this
 * codebase's general preference for plain templates over heavy libraries.
 * The result is stored as notification_letters.content and is freely
 * editable afterward (US-6.3) — this only produces the starting draft.
 */
export function renderNotificationLetterContent(input: {
  deceasedFullName: string;
  dateOfDeath: string | null;
  senderDisplayName: string;
  caseDisplayName: string;
  platformName: string;
  letterType: NotificationLetterType;
}): string {
  const dateOfDeathClause = input.dateOfDeath
    ? ` on ${new Date(input.dateOfDeath).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
    : "";

  const requestSentence =
    input.letterType === "memorialize"
      ? `I am requesting that this account be memorialized in accordance with ${input.platformName}'s bereavement policies, rather than closed.`
      : `I am requesting that this account be closed in accordance with ${input.platformName}'s bereavement policies.`;

  return [
    `To Whom It May Concern at ${input.platformName},`,
    `I am writing to inform you of the passing of ${input.deceasedFullName}${dateOfDeathClause}. I am ${input.senderDisplayName}, acting on behalf of the estate of ${input.deceasedFullName} (${input.caseDisplayName}).`,
    `${requestSentence} Please let me know what documentation you require to process this request.`,
    "Thank you for your understanding during this difficult time.",
    `Sincerely,\n${input.senderDisplayName}`,
  ].join("\n\n");
}
