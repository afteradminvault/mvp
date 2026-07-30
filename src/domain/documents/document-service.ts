import type { Estate } from "@/domain/estates/ports";
import type { Document, DocumentRepository, DocumentType, UploadDocumentInput } from "./ports";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "death_certificate",
  "letters_testamentary",
  "letters_of_administration",
  "small_estate_affidavit",
  "executor_government_id",
  "notarized_affidavit",
  "notification_letter",
  "will",
  "other",
];

// Mirrors the storage bucket's own file_size_limit/allowed_mime_types
// (supabase/migrations/20260724000000_documents_storage_and_activation.sql)
// — validated here too so a rejected upload gets a clear app-layer error
// instead of an opaque storage-API failure.
export const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
];
export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_NOTES_LENGTH = 2000;

export class InvalidDocumentInputError extends Error {}
export class DocumentNotFoundError extends Error {}
export class DocumentForbiddenError extends Error {}
export class DocumentAttachedError extends Error {}

function validateDocumentType(value: unknown): DocumentType {
  if (typeof value !== "string" || !DOCUMENT_TYPES.includes(value as DocumentType)) {
    throw new InvalidDocumentInputError(`documentType must be one of: ${DOCUMENT_TYPES.join(", ")}.`);
  }
  return value as DocumentType;
}

function validateFileName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidDocumentInputError("fileName is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_FILE_NAME_LENGTH) {
    throw new InvalidDocumentInputError(`fileName must be ${MAX_FILE_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function validateMimeType(value: unknown): string {
  if (typeof value !== "string" || !ALLOWED_MIME_TYPES.includes(value)) {
    throw new InvalidDocumentInputError(`mimeType must be one of: ${ALLOWED_MIME_TYPES.join(", ")}.`);
  }
  return value;
}

function validateFileBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new InvalidDocumentInputError("A non-empty file is required.");
  }
  if (value.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new InvalidDocumentInputError(`File must be ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB or smaller.`);
  }
  return value;
}

function validateNotes(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidDocumentInputError("notes cannot be blank if provided.");
  }
  if (value.trim().length > MAX_NOTES_LENGTH) {
    throw new InvalidDocumentInputError(`notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
  }
  return value.trim();
}

/** Every RPC/repository call in this domain raises a plain Postgres exception or is a plain "not found"; this maps them once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error) {
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new DocumentForbiddenError("You don't have access to upload or manage documents for this estate.");
    }
    if (/only the owner or an accepted executor may activate executor access/i.test(error.message)) {
      throw new DocumentForbiddenError(error.message);
    }
  }
  throw error;
}

/**
 * Orchestrates document upload/list/download/delete (Database Schema
 * §5.1, API Specification §9) and the death-certificate hard gate
 * (Security Architecture §4.1). Documents are not zero-knowledge-encrypted
 * — see ports.ts — so this service validates plain metadata, unlike the
 * vault-items domain which never sees plaintext at all.
 */
export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async listDocuments(estateId: string): Promise<Document[]> {
    return this.repository.listDocuments(estateId);
  }

  /**
   * Returns the activated estate alongside the document when the upload
   * happens to be the one that satisfies the gate (a death_certificate
   * arriving while status is already awaiting_death_certificate) — null
   * otherwise. Activation failing for any other reason (not yet in that
   * status, no certificate on file after all) is swallowed by the
   * repository as an expected no-op, not surfaced as an upload failure —
   * the document itself was still saved successfully.
   */
  async uploadDocument(
    estateId: string,
    uploadedByUserId: string,
    input: UploadDocumentInput,
  ): Promise<{ document: Document; activatedEstate: Estate | null }> {
    const documentType = validateDocumentType(input.documentType);
    const fileName = validateFileName(input.fileName);
    const mimeType = validateMimeType(input.mimeType);
    const fileBytes = validateFileBytes(input.fileBytes);
    const notes = validateNotes(input.notes);

    let document: Document;
    try {
      document = await this.repository.uploadDocument(estateId, uploadedByUserId, {
        documentType,
        fileName,
        mimeType,
        fileBytes,
        isCertifiedOriginal: input.isCertifiedOriginal ?? false,
        notes,
      });
    } catch (error) {
      translateRepositoryError(error);
    }

    let activatedEstate: Estate | null = null;
    if (documentType === "death_certificate") {
      // Best-effort, same rationale as every EmailSender call site: the
      // document itself is already saved by this point, and activation is
      // a side effect that must never retroactively fail the upload.
      try {
        activatedEstate = await this.repository.activateExecutorIfCertified(estateId);
      } catch (error) {
        console.error("activate_executor check failed after death-certificate upload:", error);
      }
    }

    return { document, activatedEstate };
  }

  /**
   * The standalone re-trigger (POST /api/estates/:id/activate-executor) —
   * covers a death_certificate uploaded before the self-cancel window
   * lapsed, so the automatic check at upload time hadn't reached
   * awaiting_death_certificate yet. Unlike the swallowed best-effort call
   * inside uploadDocument, errors here are the primary outcome of this
   * action and must propagate.
   */
  async activateExecutorIfCertified(estateId: string): Promise<Estate | null> {
    try {
      return await this.repository.activateExecutorIfCertified(estateId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async getSignedDownloadUrl(estateId: string, documentId: string): Promise<string> {
    const url = await this.repository.createSignedDownloadUrl(estateId, documentId);
    if (!url) {
      throw new DocumentNotFoundError("Document not found, or you don't have access to it.");
    }
    return url;
  }

  async deleteDocument(estateId: string, documentId: string): Promise<void> {
    const attached = await this.repository.isAttachedToAnyClosureRequest(documentId);
    if (attached) {
      throw new DocumentAttachedError(
        "This document is attached to an account closure request and can't be deleted.",
      );
    }
    try {
      await this.repository.deleteDocument(estateId, documentId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
