import { NextResponse } from "next/server";
import { AdminWillExecutionRequirementService } from "@/domain/admin-will-execution-requirements/admin-will-execution-requirement-service";
import { SupabaseAdminWillExecutionRequirementRepository } from "@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

export async function GET(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const url = new URL(request.url);
  const jurisdictionId = url.searchParams.get("jurisdictionId");
  const includeSuperseded = url.searchParams.get("includeSuperseded") === "true";

  const service = new AdminWillExecutionRequirementService(
    new SupabaseAdminWillExecutionRequirementRepository(session.supabase),
  );
  try {
    const requirements = await service.listRequirements({
      jurisdictionId: jurisdictionId ?? undefined,
      includeSuperseded,
    });
    return NextResponse.json({ requirements });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    jurisdictionId,
    witnessCount,
    notarizationRequired,
    selfProvingAffidavitAvailable,
    holographicWillsAllowed,
    executionInstructions,
    notes,
    pendingCounselReview,
  } = body as Record<string, unknown>;

  if (typeof jurisdictionId !== "string") {
    return NextResponse.json({ error: "jurisdictionId is a required string." }, { status: 400 });
  }
  if (typeof executionInstructions !== "string") {
    return NextResponse.json({ error: "executionInstructions is a required string." }, { status: 400 });
  }
  if (witnessCount !== undefined && typeof witnessCount !== "number") {
    return NextResponse.json({ error: "witnessCount must be a number if provided." }, { status: 400 });
  }
  if (notarizationRequired !== undefined && typeof notarizationRequired !== "boolean") {
    return NextResponse.json({ error: "notarizationRequired must be a boolean if provided." }, { status: 400 });
  }
  if (selfProvingAffidavitAvailable !== undefined && typeof selfProvingAffidavitAvailable !== "boolean") {
    return NextResponse.json({ error: "selfProvingAffidavitAvailable must be a boolean if provided." }, { status: 400 });
  }
  if (holographicWillsAllowed !== undefined && typeof holographicWillsAllowed !== "boolean") {
    return NextResponse.json({ error: "holographicWillsAllowed must be a boolean if provided." }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string if provided." }, { status: 400 });
  }
  if (pendingCounselReview !== undefined && typeof pendingCounselReview !== "boolean") {
    return NextResponse.json({ error: "pendingCounselReview must be a boolean if provided." }, { status: 400 });
  }

  const service = new AdminWillExecutionRequirementService(
    new SupabaseAdminWillExecutionRequirementRepository(session.supabase),
  );
  try {
    const requirement = await service.createRequirement({
      jurisdictionId,
      witnessCount: witnessCount as number | undefined,
      notarizationRequired: notarizationRequired as boolean | undefined,
      selfProvingAffidavitAvailable: selfProvingAffidavitAvailable as boolean | undefined,
      holographicWillsAllowed: holographicWillsAllowed as boolean | undefined,
      executionInstructions,
      notes: notes as string | null | undefined,
      pendingCounselReview: pendingCounselReview as boolean | undefined,
    });
    return NextResponse.json({ requirement }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
