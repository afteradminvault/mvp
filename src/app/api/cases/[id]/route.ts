import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { estateErrorResponse } from "@/app/api/_lib/estate-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * US-2.2's literal "GET /api/cases/:id resumes from draft_step" — in
 * practice the onboarding stepper pages fetch this server-side via
 * EstateService directly (same pattern as every other page in this app),
 * not through this route; it exists for API-family completeness under
 * /api/cases (mirrors GET /api/estates/:id, which already returns the
 * same draftStep/draftPayload fields — this isn't a second source of
 * truth, just the /api/cases-prefixed alias for new callers).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.getEstate(id);
    return NextResponse.json({ case: estate });
  } catch (error) {
    return estateErrorResponse(error);
  }
}
