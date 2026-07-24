import { NextResponse } from "next/server";
import { BeneficiaryService } from "@/domain/beneficiaries/beneficiary-service";
import { SupabaseBeneficiaryRepository } from "@/infrastructure/beneficiaries/supabase-beneficiary-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { beneficiaryErrorResponse } from "@/app/api/_lib/beneficiary-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/** Role: any accepted member — beneficiaries_select_member RLS already enforces this (API Specification §7). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new BeneficiaryService(
    new SupabaseBeneficiaryRepository(session.supabase),
    new SupabaseDigitalAssetRepository(session.supabase),
  );
  try {
    const beneficiaries = await service.listBeneficiaries(id);
    return NextResponse.json({ beneficiaries });
  } catch (error) {
    return beneficiaryErrorResponse(error);
  }
}

/** Role: owner — beneficiaries_write_owner RLS (API Specification §7). */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { displayName, relationship, contactEmail, digitalAssetId, notes } = body as Record<string, unknown>;

  if (typeof displayName !== "string") {
    return NextResponse.json({ error: "displayName is a required string." }, { status: 400 });
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
    const beneficiary = await service.createBeneficiary(id, {
      displayName,
      relationship,
      contactEmail,
      digitalAssetId,
      notes,
    });
    return NextResponse.json({ beneficiary }, { status: 201 });
  } catch (error) {
    return beneficiaryErrorResponse(error);
  }
}
