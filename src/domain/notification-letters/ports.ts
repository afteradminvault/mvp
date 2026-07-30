/**
 * Notification letter domain contracts (Database Schema §2.7, PRD v2
 * §3.4, Milestone 5). Framework-free, same rationale as the other
 * ports.ts files.
 */
export type NotificationLetterType = "close" | "memorialize";
export type NotificationLetterSentVia = "email" | "download" | "copy";

export interface NotificationLetter {
  id: string;
  estateId: string;
  platformId: string;
  createdByUserId: string;
  letterType: NotificationLetterType;
  content: string;
  sentVia: NotificationLetterSentVia | null;
  sentAt: string | null;
  pdfDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationLetterInput {
  platformId: string;
  letterType: NotificationLetterType;
  content: string;
}

export interface FinalizeNotificationLetterInput {
  sentVia: NotificationLetterSentVia;
  pdfDocumentId: string;
}

export interface NotificationLetterRepository {
  createLetter(estateId: string, createdByUserId: string, input: CreateNotificationLetterInput): Promise<NotificationLetter>;
  getLetter(letterId: string): Promise<NotificationLetter | null>;
  listLetters(estateId: string): Promise<NotificationLetter[]>;
  updateContent(letterId: string, content: string): Promise<NotificationLetter>;
  finalize(letterId: string, input: FinalizeNotificationLetterInput): Promise<NotificationLetter>;
  /** For the sender-name auto-fill (US-6.1) — the current user's own display_name. */
  getUserDisplayName(userId: string): Promise<string | null>;
}
