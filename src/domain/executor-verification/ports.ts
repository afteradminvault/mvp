/**
 * Executor verification domain contracts (PRD v2 Milestone 3 feature 4,
 * "Executor Portal & Verification [LOCK]"). Tracks the id-upload ->
 * legal-terms -> family-approval funnel for a nominated Executor. Unlike
 * vault items, nothing here is zero-knowledge-encrypted — the ID document
 * lives in the same encrypted-at-rest `documents` storage bucket used by
 * src/domain/documents, not the client-side-encrypted vault.
 */
export type ExecutorVerificationStatus =
  | "pending"
  | "id_uploaded"
  | "terms_accepted"
  | "family_approved"
  | "fully_verified"
  | "declined";

export interface ExecutorVerification {
  id: string;
  estateId: string;
  memberId: string;
  status: ExecutorVerificationStatus;
  idDocumentStoragePath: string | null;
  legalTermsAcceptedAt: string | null;
  familyApprovedAt: string | null;
  familyApprovedByUserId: string | null;
  familyDeclinedAt: string | null;
  familyDeclinedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadIdDocumentInput {
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
}

export interface ExecutorVerificationRepository {
  getVerification(estateId: string, memberId: string): Promise<ExecutorVerification | null>;
  uploadIdDocument(estateId: string, memberId: string, input: UploadIdDocumentInput): Promise<ExecutorVerification>;
  acceptLegalTerms(estateId: string, memberId: string): Promise<ExecutorVerification>;
  decide(estateId: string, memberId: string, approved: boolean): Promise<ExecutorVerification>;
}
