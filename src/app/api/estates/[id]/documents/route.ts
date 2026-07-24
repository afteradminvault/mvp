import { NextResponse } from "next/server";
import { DocumentService } from "@/domain/documents/document-service";
import type { DocumentType } from "@/domain/documents/ports";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { documentErrorResponse } from "@/app/api/_lib/document-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new DocumentService(new SupabaseDocumentRepository(session.supabase));
  try {
    const documents = await service.listDocuments(id);
    return NextResponse.json({ documents });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

/**
 * Multipart upload → Supabase Storage (API Specification §9). When the
 * upload is a death_certificate and the estate is already
 * awaiting_death_certificate, this is "the specific action that unlocks
 * the next stage" (API spec §4) — DocumentService.uploadDocument attempts
 * the activate_executor gate check as a best-effort side effect and
 * reports whether it fired via `activatedEstate` in the response.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "A multipart/form-data body is required." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  const documentType = formData.get("documentType");
  const notes = formData.get("notes");
  const isCertifiedOriginal = formData.get("isCertifiedOriginal");
  const fileNameField = formData.get("fileName");
  const fileName = typeof fileNameField === "string" && fileNameField.length > 0 ? fileNameField : (file as File).name;

  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const service = new DocumentService(new SupabaseDocumentRepository(session.supabase));
  try {
    const { document, activatedEstate } = await service.uploadDocument(id, session.userId, {
      documentType: documentType as DocumentType,
      fileName,
      mimeType: file.type,
      fileBytes,
      isCertifiedOriginal: isCertifiedOriginal === "true",
      notes: typeof notes === "string" && notes.length > 0 ? notes : undefined,
    });

    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "document_uploaded",
      targetTable: "documents",
      targetId: document.id,
      metadata: { documentType: document.documentType },
    });

    return NextResponse.json({ document, activatedEstate }, { status: 201 });
  } catch (error) {
    return documentErrorResponse(error);
  }
}
