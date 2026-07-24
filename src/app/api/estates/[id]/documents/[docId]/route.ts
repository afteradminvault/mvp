import { NextResponse } from "next/server";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { documentErrorResponse } from "@/app/api/_lib/document-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

/** Signed/short-lived download URL only — API Specification §9 is explicit this must never be a public storage URL. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id, docId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new DocumentService(new SupabaseDocumentRepository(session.supabase));
  try {
    const downloadUrl = await service.getSignedDownloadUrl(id, docId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "document_downloaded",
      targetTable: "documents",
      targetId: docId,
    });
    return NextResponse.json({ downloadUrl });
  } catch (error) {
    return documentErrorResponse(error);
  }
}

/** Rejects with a clear error rather than silently orphaning a closure request's evidence — API Specification §9. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, docId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new DocumentService(new SupabaseDocumentRepository(session.supabase));
  try {
    await service.deleteDocument(id, docId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "document_deleted",
      targetTable: "documents",
      targetId: docId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return documentErrorResponse(error);
  }
}
