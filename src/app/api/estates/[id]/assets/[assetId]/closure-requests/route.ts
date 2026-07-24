import { NextResponse } from "next/server";
import { ClosureRequestService } from "@/domain/closure-requests/closure-request-service";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { closureRequestErrorResponse } from "@/app/api/_lib/closure-request-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string; assetId: string }> };

/**
 * Creates the request and snapshots the current legal_requirements
 * checklist into legal_requirement_snapshot (Database Schema §5.2, API
 * Specification §10) — role: executor, enforced by
 * closure_requests_write_executor RLS (already in place from the initial
 * schema migration; no new migration needed for this feature).
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id, assetId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new ClosureRequestService(
    new SupabaseClosureRequestRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabaseAdminLegalRequirementRepository(session.supabase),
  );
  try {
    const closureRequest = await service.createClosureRequest(id, assetId);
    await writeAuditLog(session.supabase, {
      estateId: id,
      actorUserId: session.userId,
      eventType: "closure_request_created",
      targetTable: "account_closure_requests",
      targetId: closureRequest.id,
    });
    return NextResponse.json({ closureRequest }, { status: 201 });
  } catch (error) {
    return closureRequestErrorResponse(error);
  }
}
