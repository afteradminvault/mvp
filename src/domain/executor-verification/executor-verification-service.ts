import { ALLOWED_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from "@/domain/documents/document-service";
import type { ExecutorVerification, ExecutorVerificationRepository, UploadIdDocumentInput } from "./ports";

export const MAX_ID_FILE_NAME_LENGTH = 255;

export class InvalidExecutorVerificationInputError extends Error {}
export class ExecutorVerificationForbiddenError extends Error {}
export class ExecutorVerificationNotFoundError extends Error {}

function validateFileName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidExecutorVerificationInputError("fileName is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_ID_FILE_NAME_LENGTH) {
    throw new InvalidExecutorVerificationInputError(`fileName must be ${MAX_ID_FILE_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function validateMimeType(value: unknown): string {
  if (typeof value !== "string" || !ALLOWED_MIME_TYPES.includes(value)) {
    throw new InvalidExecutorVerificationInputError(`mimeType must be one of: ${ALLOWED_MIME_TYPES.join(", ")}.`);
  }
  return value;
}

function validateFileBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new InvalidExecutorVerificationInputError("A non-empty file is required.");
  }
  if (value.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new InvalidExecutorVerificationInputError(`File must be ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB or smaller.`);
  }
  return value;
}

/** Every RPC in this domain raises a plain Postgres exception; this maps their messages to typed errors, once, in one place. */
function translateRepositoryError(error: unknown): never {
  if (error instanceof Error) {
    if (
      /only the nominated executor may|only a family member can decide|row-level security|permission denied/i.test(
        error.message,
      )
    ) {
      throw new ExecutorVerificationForbiddenError(error.message);
    }
    if (/executor verification record not found/i.test(error.message)) {
      throw new ExecutorVerificationNotFoundError("Executor verification record not found.");
    }
  }
  throw error;
}

/**
 * Orchestrates the id-upload -> legal-terms -> family-approval funnel. No
 * authorization logic lives here — every mutation delegates to the
 * SECURITY DEFINER RPCs in
 * supabase/migrations/20260801000000_executor_verifications.sql, which are
 * the actual enforcement point (same shape as MembershipService).
 */
export class ExecutorVerificationService {
  constructor(private readonly repository: ExecutorVerificationRepository) {}

  async getVerification(estateId: string, memberId: string): Promise<ExecutorVerification> {
    const verification = await this.repository.getVerification(estateId, memberId);
    if (!verification) {
      throw new ExecutorVerificationNotFoundError("Executor verification record not found.");
    }
    return verification;
  }

  async uploadIdDocument(
    estateId: string,
    memberId: string,
    input: UploadIdDocumentInput,
  ): Promise<ExecutorVerification> {
    const fileName = validateFileName(input.fileName);
    const mimeType = validateMimeType(input.mimeType);
    const fileBytes = validateFileBytes(input.fileBytes);

    try {
      return await this.repository.uploadIdDocument(estateId, memberId, { fileName, mimeType, fileBytes });
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async acceptLegalTerms(estateId: string, memberId: string): Promise<ExecutorVerification> {
    try {
      return await this.repository.acceptLegalTerms(estateId, memberId);
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async decide(estateId: string, memberId: string, approved: boolean): Promise<ExecutorVerification> {
    try {
      return await this.repository.decide(estateId, memberId, approved);
    } catch (error) {
      translateRepositoryError(error);
    }
  }
}
