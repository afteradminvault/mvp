import { NextResponse } from "next/server";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { estateErrorResponse } from "@/app/api/_lib/estate-error-response";

/**
 * The onboarding entry point (PRD v2 §3.2, US-2.1) — creates a case in
 * 'draft' status via create_draft_case(), distinct from POST /api/estates
 * (create_case(), still live for its own flow — see
 * SupabaseEstateRepository's own doc comment). New URL family (`/api/cases`
 * rather than `/api/estates`) since this is net-new work, per the agreed
 * Milestone 0 scope of only renaming existing routes when their feature is
 * individually revisited.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    jurisdictionId,
    deceasedFullName,
    deceasedDateOfBirth,
    deceasedRelationship,
    deceasedDateOfDeath,
    isSelfPlanned,
  } = body as Record<string, unknown>;

  if (typeof jurisdictionId !== "string") {
    return NextResponse.json({ error: "jurisdictionId is a required string." }, { status: 400 });
  }
  if (typeof deceasedFullName !== "string") {
    return NextResponse.json({ error: "deceasedFullName is a required string." }, { status: 400 });
  }
  if (typeof deceasedDateOfBirth !== "string") {
    return NextResponse.json({ error: "deceasedDateOfBirth is a required string." }, { status: 400 });
  }
  if (typeof deceasedRelationship !== "string") {
    return NextResponse.json({ error: "deceasedRelationship is a required string." }, { status: 400 });
  }
  if (
    deceasedDateOfDeath !== undefined &&
    deceasedDateOfDeath !== null &&
    typeof deceasedDateOfDeath !== "string"
  ) {
    return NextResponse.json({ error: "deceasedDateOfDeath must be a string if provided." }, { status: 400 });
  }
  if (isSelfPlanned !== undefined && typeof isSelfPlanned !== "boolean") {
    return NextResponse.json({ error: "isSelfPlanned must be a boolean if provided." }, { status: 400 });
  }

  const service = new EstateService(new SupabaseEstateRepository(session.supabase));
  try {
    const estate = await service.createDraftCase({
      jurisdictionId,
      deceasedFullName,
      deceasedDateOfBirth,
      deceasedRelationship,
      deceasedDateOfDeath: deceasedDateOfDeath as string | null | undefined,
      isSelfPlanned: isSelfPlanned as boolean | undefined,
    });
    return NextResponse.json({ case: estate }, { status: 201 });
  } catch (error) {
    return estateErrorResponse(error);
  }
}
