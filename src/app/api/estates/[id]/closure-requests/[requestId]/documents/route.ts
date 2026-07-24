import { NextResponse } from "next/server";
import { ClosureRequestNotFoundError, ClosureRequestService } from "@/domain/closure-requests/closure-request-service";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { closureRequestErrorResponse } from "@/app/api/_lib/closure-request-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; requestId: string }> };

/**
 * Attach an existing documents row (the upload-once-reuse-many pattern,
 * Database Schema §5.3, PRD §4.4) — role: executor, acrd_write_executor
 * RLS. ClosureRequestService.attachDocument independently re-derives the
 * document's own estate_id and rejects if it doesn't match this request's
 * estate, rather than trusting the request body.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id, requestId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { documentId } = body as Record<string, unknown>;

  const service = new ClosureRequestService(
    new SupabaseClosureRequestRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabaseAdminLegalRequirementRepository(session.supabase),
  );
  try {
    const existing = await service.getClosureRequest(requestId);
    if (existing.estateId !== id) {
      throw new ClosureRequestNotFoundError("Closure request not found, or you don't have access to it.");
    }

    const closureRequest = await service.attachDocument(requestId, documentId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "closure_request_document_attached",
      targetTable: "account_closure_requests",
      targetId: requestId,
      metadata: { documentId },
    });
    return NextResponse.json({ closureRequest }, { status: 201 });
  } catch (error) {
    return closureRequestErrorResponse(error);
  }
}
