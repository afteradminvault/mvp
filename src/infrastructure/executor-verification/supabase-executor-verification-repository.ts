import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExecutorVerification,
  ExecutorVerificationRepository,
  ExecutorVerificationStatus,
  UploadIdDocumentInput,
} from "@/domain/executor-verification/ports";

const BUCKET = "documents";

interface ExecutorVerificationRow {
  id: string;
  case_id: string;
  member_id: string;
  status: ExecutorVerificationStatus;
  id_document_storage_path: string | null;
  legal_terms_accepted_at: string | null;
  family_approved_at: string | null;
  family_approved_by_user_id: string | null;
  family_declined_at: string | null;
  family_declined_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function toExecutorVerification(row: ExecutorVerificationRow): ExecutorVerification {
  return {
    id: row.id,
    estateId: row.case_id,
    memberId: row.member_id,
    status: row.status,
    idDocumentStoragePath: row.id_document_storage_path,
    legalTermsAcceptedAt: row.legal_terms_accepted_at,
    familyApprovedAt: row.family_approved_at,
    familyApprovedByUserId: row.family_approved_by_user_id,
    familyDeclinedAt: row.family_declined_at,
    familyDeclinedByUserId: row.family_declined_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Concrete adapter against Supabase. Every mutation goes through the
 * SECURITY DEFINER RPCs in
 * supabase/migrations/20260801000000_executor_verifications.sql — this
 * repository does no authorization logic of its own. The ID document is
 * stored in the same `documents` bucket/RLS as src/infrastructure/documents
 * (encrypted-at-rest, readable by any accepted case member, not the
 * zero-knowledge vault) — reusing it rather than inventing a parallel
 * storage scheme.
 */
export class SupabaseExecutorVerificationRepository implements ExecutorVerificationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getVerification(estateId: string, memberId: string): Promise<ExecutorVerification | null> {
    const { data, error } = await this.supabase
      .from("executor_verifications")
      .select("*")
      .eq("case_id", estateId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) throw error;
    return data ? toExecutorVerification(data as ExecutorVerificationRow) : null;
  }

  /**
   * Path is keyed by memberId, not a fresh id per upload — an executor has
   * exactly one verification record, and re-uploading (e.g. a retake after
   * a blurry photo) should replace it, not accumulate orphaned objects.
   */
  async uploadIdDocument(
    estateId: string,
    memberId: string,
    input: UploadIdDocumentInput,
  ): Promise<ExecutorVerification> {
    const storagePath = `${estateId}/executor-verification/${memberId}`;

    const { error: uploadError } = await this.supabase.storage.from(BUCKET).upload(storagePath, input.fileBytes, {
      contentType: input.mimeType,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await this.supabase.rpc("upload_executor_id_document", {
      p_case_id: estateId,
      p_member_id: memberId,
      p_storage_path: storagePath,
    });
    if (error) throw error;
    return toExecutorVerification(data as ExecutorVerificationRow);
  }

  async acceptLegalTerms(estateId: string, memberId: string): Promise<ExecutorVerification> {
    const { data, error } = await this.supabase.rpc("accept_executor_legal_terms", {
      p_case_id: estateId,
      p_member_id: memberId,
    });
    if (error) throw error;
    return toExecutorVerification(data as ExecutorVerificationRow);
  }

  async decide(estateId: string, memberId: string, approved: boolean): Promise<ExecutorVerification> {
    const { data, error } = await this.supabase.rpc("decide_executor_verification", {
      p_case_id: estateId,
      p_member_id: memberId,
      p_approved: approved,
    });
    if (error) throw error;
    return toExecutorVerification(data as ExecutorVerificationRow);
  }
}
