import type { EstateRepository } from "@/domain/estates/ports";
import type { PlatformRepository } from "@/domain/platforms/ports";
import type { DocumentRepository } from "@/domain/documents/ports";
import type { EmailSender } from "@/domain/notifications/ports";
import { renderNotificationLetterContent } from "@/infrastructure/notification-letters/render-notification-letter";
import { generateNotificationLetterPdf } from "@/infrastructure/notification-letters/generate-notification-letter-pdf";
import type {
  NotificationLetter,
  NotificationLetterRepository,
  NotificationLetterSentVia,
  NotificationLetterType,
} from "./ports";

export const NOTIFICATION_LETTER_TYPES: readonly NotificationLetterType[] = ["close", "memorialize"];
export const NOTIFICATION_LETTER_SENT_VIA: readonly NotificationLetterSentVia[] = ["email", "download", "copy"];
export const MAX_LETTER_CONTENT_LENGTH = 20000;

export class InvalidNotificationLetterInputError extends Error {}
export class NotificationLetterNotFoundError extends Error {}
export class NotificationLetterAlreadyFinalizedError extends Error {}
export class NotificationLetterForbiddenError extends Error {}

function validateLetterType(value: unknown): NotificationLetterType {
  if (typeof value !== "string" || !NOTIFICATION_LETTER_TYPES.includes(value as NotificationLetterType)) {
    throw new InvalidNotificationLetterInputError(`letterType must be one of: ${NOTIFICATION_LETTER_TYPES.join(", ")}.`);
  }
  return value as NotificationLetterType;
}

function validatePlatformId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidNotificationLetterInputError("platformId is required.");
  }
  return value.trim();
}

function validateContent(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidNotificationLetterInputError("content is required.");
  }
  if (value.length > MAX_LETTER_CONTENT_LENGTH) {
    throw new InvalidNotificationLetterInputError(`content must be ${MAX_LETTER_CONTENT_LENGTH} characters or fewer.`);
  }
  return value;
}

function validateSentVia(value: unknown): NotificationLetterSentVia {
  if (typeof value !== "string" || !NOTIFICATION_LETTER_SENT_VIA.includes(value as NotificationLetterSentVia)) {
    throw new InvalidNotificationLetterInputError(`sentVia must be one of: ${NOTIFICATION_LETTER_SENT_VIA.join(", ")}.`);
  }
  return value as NotificationLetterSentVia;
}

/** Every RLS-backed write in this domain raises a plain Postgres exception; this maps it once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error && /row-level security|permission denied/i.test(error.message)) {
    throw new NotificationLetterForbiddenError("Only an accepted Family member for this case can do that.");
  }
  throw error;
}

/**
 * Orchestrates the notification-letter funnel (Database Schema §2.7, PRD
 * v2 §3.4): auto-fill (US-6.1/6.2) -> inline edit (US-6.3) -> finalize via
 * one of email/download/copy, always with an auto-stored PDF (US-6.4/6.5).
 * "Deceased profile" data is read from cases.deceased_full_name/
 * deceased_date_of_death — populated by create_draft_case() (Milestone 1
 * feature 1), not new to this feature.
 */
export class NotificationLetterService {
  constructor(
    private readonly repository: NotificationLetterRepository,
    private readonly estateRepository: EstateRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly documentRepository: DocumentRepository,
    private readonly emailSender: EmailSender,
  ) {}

  /** US-6.1/6.2 — auto-fills from the case's deceased profile + platform template; memorialize only offered when the platform supports it. */
  async generateLetter(
    estateId: string,
    userId: string,
    input: { platformId: unknown; letterType: unknown },
  ): Promise<NotificationLetter> {
    const platformId = validatePlatformId(input.platformId);
    const letterType = validateLetterType(input.letterType);

    const estate = await this.estateRepository.getEstate(estateId);
    if (!estate) {
      throw new NotificationLetterNotFoundError("Case not found, or you don't have access to it.");
    }
    if (!estate.deceasedFullName) {
      throw new InvalidNotificationLetterInputError(
        "This case has no deceased profile on file yet — add the deceased's name before generating a letter.",
      );
    }

    const platform = await this.platformRepository.getPlatform(platformId);
    if (!platform) {
      throw new InvalidNotificationLetterInputError("Platform not found.");
    }
    if (letterType === "memorialize" && !platform.supportsMemorialize) {
      throw new InvalidNotificationLetterInputError(`${platform.name} does not support memorializing an account.`);
    }

    const senderDisplayName = (await this.repository.getUserDisplayName(userId)) ?? "The estate's Family contact";

    const content = renderNotificationLetterContent({
      deceasedFullName: estate.deceasedFullName,
      dateOfDeath: estate.deceasedDateOfDeath,
      senderDisplayName,
      caseDisplayName: estate.displayName,
      platformName: platform.name,
      letterType,
    });

    try {
      return await this.repository.createLetter(estateId, userId, { platformId, letterType, content });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getLetter(letterId: string): Promise<NotificationLetter> {
    const letter = await this.repository.getLetter(letterId);
    if (!letter) {
      throw new NotificationLetterNotFoundError("Notification letter not found, or you don't have access to it.");
    }
    return letter;
  }

  async listLetters(estateId: string): Promise<NotificationLetter[]> {
    return this.repository.listLetters(estateId);
  }

  /** US-6.3 — edits are only allowed before finalization. */
  async updateContent(letterId: string, content: unknown): Promise<NotificationLetter> {
    const validContent = validateContent(content);
    const letter = await this.getLetter(letterId);
    if (letter.sentAt !== null) {
      throw new NotificationLetterAlreadyFinalizedError("This letter has already been sent and can no longer be edited.");
    }

    try {
      return await this.repository.updateContent(letterId, validContent);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  /**
   * US-6.4/6.5 — regardless of which of the three paths is used, a PDF is
   * generated from the letter's current content and stored via the same
   * `documents` bucket/table as every other case document (so it "just
   * appears" in the existing document list, per US-6.5's own AC), and
   * sent_via/sent_at are recorded together, atomically, as the single
   * "finalize" transition. Email sending is best-effort, same rationale as
   * every other EmailSender call site: a failed/unconfigured send must
   * never block finalization, which is otherwise already complete by that
   * point.
   */
  async finalize(estateId: string, letterId: string, userId: string, sentVia: unknown): Promise<NotificationLetter> {
    const validSentVia = validateSentVia(sentVia);
    const letter = await this.getLetter(letterId);
    if (letter.sentAt !== null) {
      throw new NotificationLetterAlreadyFinalizedError("This letter has already been sent.");
    }

    const platform = await this.platformRepository.getPlatform(letter.platformId);
    if (!platform) {
      throw new InvalidNotificationLetterInputError("Platform not found.");
    }
    if (validSentVia === "email" && !platform.bereavementContactEmail) {
      throw new InvalidNotificationLetterInputError(`${platform.name} has no bereavement contact email on file.`);
    }

    const pdfBytes = await generateNotificationLetterPdf({ platformName: platform.name, content: letter.content });
    const document = await this.documentRepository.uploadDocument(estateId, userId, {
      documentType: "notification_letter",
      fileName: `notification-letter-${platform.name}.pdf`,
      mimeType: "application/pdf",
      fileBytes: pdfBytes,
    });

    if (validSentVia === "email" && platform.bereavementContactEmail) {
      await this.emailSender.sendNotificationLetterEmail({
        toEmail: platform.bereavementContactEmail,
        subject: `Notice regarding ${platform.name} account`,
        content: letter.content,
      });
    }

    try {
      return await this.repository.finalize(letterId, { sentVia: validSentVia, pdfDocumentId: document.id });
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
