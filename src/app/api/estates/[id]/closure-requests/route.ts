import { NextResponse } from "next/server";
import { ClosureRequestService } from "@/domain/closure-requests/closure-request-service";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { closureRequestErrorResponse } from "@/app/api/_lib/closure-request-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * List, filterable by status/category (API Specification §10, PRD §4.5).
 * Role: any accepted member — closure_requests_select_member RLS already
 * enforces this; no app-layer role check needed. Nothing here reveals a
 * path to vault content: digital_asset_id alone doesn't grant access to
 * digital_vault_items, which has no Helper RLS policy at all regardless.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const category = searchParams.get("category") ?? undefined;

  const service = new ClosureRequestService(
    new SupabaseClosureRequestRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
    new SupabaseEstateRepository(session.supabase),
    new SupabaseAdminLegalRequirementRepository(session.supabase),
  );
  try {
    const requests = await service.listClosureRequests(id, { status, category });
    return NextResponse.json({ closureRequests: requests });
  } catch (error) {
    return closureRequestErrorResponse(error);
  }
}
