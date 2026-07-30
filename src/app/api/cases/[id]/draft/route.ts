import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { estateErrorResponse } from "@/app/api/_lib/estate-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * US-2.2 — saves onboarding progress after each step, not only on an
 * explicit "save" action (the stepper calls this on every step's submit).
 * draftPayload is merged into the existing value by EstateService, not
 * replaced, so an earlier step's answers survive a later step's save.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { draftStep, draftPayload } = body as Record<string, unknown>;
  if (typeof draftStep !== "string") {
    return NextResponse.json({ error: "draftStep is a required string." }, { status: 400 });
  }
  if (typeof draftPayload !== "object" || draftPayload === null || Array.isArray(draftPayload)) {
    return NextResponse.json({ error: "draftPayload is a required object." }, { status: 400 });
  }

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.saveDraftProgress(id, {
      draftStep,
      draftPayload: draftPayload as Record<string, unknown>,
    });
    return NextResponse.json({ case: estate });
  } catch (error) {
    return estateErrorResponse(error);
  }
}
