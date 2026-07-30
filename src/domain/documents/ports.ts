import type { Estate } from "@/domain/estates/ports";

/**
 * Documents domain contracts (Database Schema §5.1, API Specification §9).
 * Framework-free, same rationale as the other ports.ts files. Unlike vault
 * items, documents are NOT zero-knowledge-encrypted (Security Architecture
 * §55) — executors and, potentially, platform support need to read them as
 * part of the actual workflow. Protected by encryption-at-rest + strict
 * access control (Storage RLS, see the documents_storage_* policies in
 * supabase/migrations/20260724000000_documents_storage_and_activation.sql),
 * not client-side crypto.
 */
export type DocumentType =
  | "death_certificate"
  | "letters_testamentary"
  | "letters_of_administration"
  | "small_estate_affidavit"
  | "executor_government_id"
  | "notarized_affidavit"
  | "notification_letter"
  | "will"
  | "other";

export interface Document {
  id: string;
  estateId: string;
  uploadedByUserId: string;
  documentType: DocumentType;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  isCertifiedOriginal: boolean;
  notes: string | null;
  uploadedAt: string;
}

export interface UploadDocumentInput {
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  isCertifiedOriginal?: boolean;
  notes?: string;
}

export interface DocumentRepository {
  listDocuments(estateId: string): Promise<Document[]>;
  getDocument(estateId: string, documentId: string): Promise<Document | null>;
  uploadDocument(estateId: string, uploadedByUserId: string, input: UploadDocumentInput): Promise<Document>;
  createSignedDownloadUrl(estateId: string, documentId: string): Promise<string | null>;
  deleteDocument(estateId: string, documentId: string): Promise<void>;
  isAttachedToAnyClosureRequest(documentId: string): Promise<boolean>;
  /**
   * The hard gate (Security Architecture §4.1). Re-verified entirely
   * inside activate_executor() — see that function's own doc comment for
   * why. Returns null (not an error) when the gate isn't open yet (e.g. a
   * certificate uploaded before the self-cancel window lapsed) — that's an
   * expected, benign outcome, not a failure.
   */
  activateExecutorIfCertified(estateId: string): Promise<Estate | null>;
}
