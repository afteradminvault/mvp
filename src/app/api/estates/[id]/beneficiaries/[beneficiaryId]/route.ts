import { NextResponse } from "next/server";
import { BeneficiaryNotFoundError, BeneficiaryService } from "@/domain/beneficiaries/beneficiary-service";
import { SupabaseBeneficiaryRepository } from "@/infrastructure/beneficiaries/supabase-beneficiary-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { beneficiaryErrorResponse } from "@/app/api/_lib/beneficiary-error-response";

type RouteParams = { params: Promise<{ id: string; beneficiaryId: string }> };

/**
 * Verifying beneficiary.estateId === the URL's :id is the same defense-in-
 * depth/API-correctness check used by the assets and closure-request
 * routes — RLS already prevents any real cross-estate access; this just
 * avoids a confusing response if the URL and row disagree.
 */
async function getBeneficiaryScopedToEstate(service: BeneficiaryService, estateId: string, beneficiaryId: string) {
  const beneficiary = await service.getBeneficiary(beneficiaryId);
  if (beneficiary.estateId !== estateId) {
    throw new BeneficiaryNotFoundError("Beneficiary not found, or you don't have access to it.");
  }
  return beneficiary;
}

/** Role: owner — beneficiaries_write_owner RLS (API Specification §7). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, beneficiaryId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { displayName, relationship, contactEmail, digitalAssetId, notes } = body as Record<string, unknown>;

  if (displayName !== undefined && typeof displayName !== "string") {
    return NextResponse.json({ error: "displayName must be a string if provided." }, { status: 400 });
  }
  if (relationship !== undefined && relationship !== null && typeof relationship !== "string") {
    return NextResponse.json({ error: "relationship must be a string if provided." }, { status: 400 });
  }
  if (contactEmail !== undefined && contactEmail !== null && typeof contactEmail !== "string") {
    return NextResponse.json({ error: "contactEmail must be a string if provided." }, { status: 400 });
  }
  if (digitalAssetId !== undefined && digitalAssetId !== null && typeof digitalAssetId !== "string") {
    return NextResponse.json({ error: "digitalAssetId must be a string if provided." }, { status: 400 });
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string if provided." }, { status: 400 });
  }

  const service = new BeneficiaryService(
    new SupabaseBeneficiaryRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
  );
  try {
    await getBeneficiaryScopedToEstate(service, id, beneficiaryId);
    const beneficiary = await service.updateBeneficiary(id, beneficiaryId, {
      displayName,
      relationship,
      contactEmail,
      digitalAssetId,
      notes,
    });
    return NextResponse.json({ beneficiary });
  } catch (error) {
    return beneficiaryErrorResponse(error);
  }
}

/** Role: owner — beneficiaries_write_owner RLS. A real hard delete, unlike digital_assets' archive-only pattern: a beneficiary has no closure-request-style history that would be broken by removing the row. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, beneficiaryId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new BeneficiaryService(
    new SupabaseBeneficiaryRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
  );
  try {
    await getBeneficiaryScopedToEstate(service, id, beneficiaryId);
    await service.deleteBeneficiary(beneficiaryId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return beneficiaryErrorResponse(error);
  }
}
