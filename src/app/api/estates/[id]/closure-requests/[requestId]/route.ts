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
 * Verifying request.estateId === the URL's :id is the same defense-in-depth/
 * API-correctness check used by the vault-items routes — RLS already
 * prevents any real cross-estate access; this just avoids a confusing
 * response if the URL and row disagree.
 */
async function getRequestScopedToEstate(service: ClosureRequestService, estateId: string, requestId: string) {
  const request = await service.getClosureRequest(requestId);
  if (request.estateId !== estateId) {
    throw new ClosureRequestNotFoundError("Closure request not found, or you don't have access to it.");
  }
  return request;
}

/** Status transitions, assigned_to_user_id (API Specification §10) — role: executor, closure_requests_write_executor RLS. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, requestId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { status, assignedToUserId } = body as Record<string, unknown>;

  const service = new ClosureRequestService(
    new SupabaseClosureRequestRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabaseAdminLegalRequirementRepository(session.supabase),
  );
  try {
    await getRequestScopedToEstate(service, id, requestId);
    const closureRequest = await service.updateClosureRequest(requestId, { status, assignedToUserId });

    if (status !== undefined) {
      await writeAuditLog(session.supabase, {
        estateId: id,
        actorUserId: session.userId,
        eventType: "closure_request_status_changed",
        targetTable: "account_closure_requests",
        targetId: requestId,
        metadata: { status: closureRequest.status },
      });
    }

    return NextResponse.json({ closureRequest });
  } catch (error) {
    return closureRequestErrorResponse(error);
  }
}
