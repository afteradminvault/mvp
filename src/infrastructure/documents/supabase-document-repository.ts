import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Document, DocumentRepository, DocumentType, UploadDocumentInput } from "@/domain/documents/ports";
import type { Estate } from "@/domain/estates/ports";
import { toEstate, type EstateRow } from "@/infrastructure/estates/supabase-estate-repository";

const BUCKET = "documents";
// Short-lived per API Specification §9 ("signed/short-lived download
// URLs, never public storage URLs") — long enough for a single download
// to start, short enough that a leaked link is useless soon after.
const SIGNED_URL_EXPIRY_SECONDS = 60;

interface DocumentRow {
  id: string;
  estate_id: string;
  uploaded_by_user_id: string;
  document_type: DocumentType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  is_certified_original: boolean;
  notes: string | null;
  uploaded_at: string;
}

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    estateId: row.estate_id,
    uploadedByUserId: row.uploaded_by_user_id,
    documentType: row.document_type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    isCertifiedOriginal: row.is_certified_original,
    notes: row.notes,
    uploadedAt: row.uploaded_at,
  };
}

/**
 * Concrete adapter against Supabase Storage + the documents table.
 * Uploads use the caller's own session client (not service role) so
 * Storage RLS (documents_storage_insert_owner_or_executor) actually gates
 * the write by role, same reasoning as every other estate-scoped table in
 * this codebase.
 */
export class SupabaseDocumentRepository implements DocumentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listDocuments(estateId: string): Promise<Document[]> {
    const { data, error } = await this.supabase
      .from("documents")
      .select("*")
      .eq("estate_id", estateId)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data as DocumentRow[]).map(toDocument);
  }

  async getDocument(estateId: string, documentId: string): Promise<Document | null> {
    const { data, error } = await this.supabase
      .from("documents")
      .select("*")
      .eq("estate_id", estateId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw error;
    return data ? toDocument(data as DocumentRow) : null;
  }

  /**
   * The document's own id doubles as its storage object name
   * ({estateId}/{documentId}) — generated up front so the storage upload
   * and the row insert reference the same path, and so the original file
   * name never appears in the storage key itself (it's carried separately
   * in file_name, applied as the download filename via signed URLs'
   * `download` option instead).
   */
  async uploadDocument(estateId: string, uploadedByUserId: string, input: UploadDocumentInput): Promise<Document> {
    const documentId = randomUUID();
    const storagePath = `${estateId}/${documentId}`;

    const { error: uploadError } = await this.supabase.storage.from(BUCKET).upload(storagePath, input.fileBytes, {
      contentType: input.mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await this.supabase
      .from("documents")
      .insert({
        id: documentId,
        estate_id: estateId,
        uploaded_by_user_id: uploadedByUserId,
        document_type: input.documentType,
        storage_path: storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        file_size_bytes: input.fileBytes.byteLength,
        is_certified_original: input.isCertifiedOriginal ?? false,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();
    if (error) {
      // The row insert failed after the blob already landed in storage —
      // clean up the orphaned object rather than leaving storage and the
      // database out of sync.
      await this.supabase.storage.from(BUCKET).remove([storagePath]);
      throw error;
    }
    return toDocument(data as DocumentRow);
  }

  async createSignedDownloadUrl(estateId: string, documentId: string): Promise<string | null> {
    const document = await this.getDocument(estateId, documentId);
    if (!document) return null;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(document.storagePath, SIGNED_URL_EXPIRY_SECONDS, { download: document.fileName });
    if (error) throw error;
    return data.signedUrl;
  }

  async deleteDocument(estateId: string, documentId: string): Promise<void> {
    const document = await this.getDocument(estateId, documentId);
    if (!document) return;

    const { error: dbError } = await this.supabase.from("documents").delete().eq("id", documentId);
    if (dbError) throw dbError;

    const { error: storageError } = await this.supabase.storage.from(BUCKET).remove([document.storagePath]);
    if (storageError) throw storageError;
  }

  async isAttachedToAnyClosureRequest(documentId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("account_closure_request_documents")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async activateExecutorIfCertified(estateId: string): Promise<Estate | null> {
    const { data, error } = await this.supabase.rpc("activate_executor", { p_estate_id: estateId });
    if (error) {
      if (/this estate is not awaiting a death certificate/i.test(error.message)) {
        return null;
      }
      throw error;
    }
    return toEstate(data as EstateRow);
  }
}
