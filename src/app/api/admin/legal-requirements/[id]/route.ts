import { NextResponse } from "next/server";
import { AdminLegalRequirementService } from "@/domain/admin-legal-requirements/admin-legal-requirement-service";
import type { RequirementType, SubmissionChannel } from "@/domain/admin-legal-requirements/ports";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * "Edit" here never mutates the existing row's content — it creates a new
 * version and marks the existing one superseded (Database Schema §3.2).
 * The request/response shape looks like a normal PATCH; the versioning
 * happens inside AdminLegalRequirementService.reviseRequirement.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    jurisdictionId,
    assetCategory,
    providerId,
    requirementType,
    submissionChannel,
    submissionDetail,
    displayOrder,
    notes,
    pendingCounselReview,
  } = body as Record<string, unknown>;

  if (typeof jurisdictionId !== "string" || typeof assetCategory !== "string") {
    return NextResponse.json({ error: "jurisdictionId and assetCategory are required strings." }, { status: 400 });
  }
  if (typeof requirementType !== "string" || typeof submissionChannel !== "string") {
    return NextResponse.json(
      { error: "requirementType and submissionChannel are required strings." },
      { status: 400 },
    );
  }
  if (providerId !== undefined && providerId !== null && typeof providerId !== "string") {
    return NextResponse.json({ error: "providerId must be a string if provided." }, { status: 400 });
  }
  if (submissionDetail !== undefined && submissionDetail !== null && typeof submissionDetail !== "string") {
    return NextResponse.json({ error: "submissionDetail must be a string if provided." }, { status: 400 });
  }
  if (displayOrder !== undefined && typeof displayOrder !== "number") {
    return NextResponse.json({ error: "displayOrder must be a number if provided." }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string if provided." }, { status: 400 });
  }
  if (pendingCounselReview !== undefined && typeof pendingCounselReview !== "boolean") {
    return NextResponse.json({ error: "pendingCounselReview must be a boolean if provided." }, { status: 400 });
  }

  const service = new AdminLegalRequirementService(new SupabaseAdminLegalRequirementRepository(session.supabase));
  try {
    const requirement = await service.reviseRequirement(id, {
      jurisdictionId,
      assetCategory: assetCategory as AssetCategory,
      providerId: providerId as string | null | undefined,
      requirementType: requirementType as RequirementType,
      submissionChannel: submissionChannel as SubmissionChannel,
      submissionDetail: submissionDetail as string | null | undefined,
      displayOrder: displayOrder as number | undefined,
      notes: notes as string | null | undefined,
      pendingCounselReview: pendingCounselReview as boolean | undefined,
    });
    return NextResponse.json({ requirement });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
