import { NextResponse } from "next/server";
import { AssetNotFoundError, AssetService } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { assetErrorResponse } from "@/app/api/_lib/asset-error-response";

type RouteParams = { params: Promise<{ id: string; assetId: string }> };

/**
 * Verifying asset.estateId === the URL's :id is a defense-in-depth /
 * API-correctness check RLS can't express (RLS gates on the row's *actual*
 * estate_id, not what the URL claims) — see docs/SECURITY_ARCHITECTURE.md
 * §3.2's rationale for app-layer checks alongside RLS. Not a security hole
 * without it (RLS already prevents any cross-estate access), just avoids a
 * confusing response if the URL and the row disagree.
 */
async function getAssetScopedToEstate(service: AssetService, estateId: string, assetId: string) {
  const asset = await service.getAsset(assetId);
  if (asset.estateId !== estateId) {
    throw new AssetNotFoundError("Asset not found, or you don't have access to it.");
  }
  return asset;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id, assetId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AssetService(new SupabaseDigitalAssetRepository(session.supabase));
  try {
    const asset = await getAssetScopedToEstate(service, id, assetId);
    return NextResponse.json({ asset });
  } catch (error) {
    return assetErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, assetId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    category,
    providerId,
    customProviderName,
    accountIdentifier,
    intendedOutcome,
    intendedOutcomeNotes,
    estimatedValueCents,
    currency,
  } = body as Record<string, unknown>;

  if (category !== undefined && typeof category !== "string") {
    return NextResponse.json({ error: "category must be a string if provided." }, { status: 400 });
  }
  if (providerId !== undefined && providerId !== null && typeof providerId !== "string") {
    return NextResponse.json({ error: "providerId must be a string if provided." }, { status: 400 });
  }
  if (customProviderName !== undefined && customProviderName !== null && typeof customProviderName !== "string") {
    return NextResponse.json({ error: "customProviderName must be a string if provided." }, { status: 400 });
  }
  if (accountIdentifier !== undefined && accountIdentifier !== null && typeof accountIdentifier !== "string") {
    return NextResponse.json({ error: "accountIdentifier must be a string if provided." }, { status: 400 });
  }
  if (intendedOutcome !== undefined && typeof intendedOutcome !== "string") {
    return NextResponse.json({ error: "intendedOutcome must be a string if provided." }, { status: 400 });
  }
  if (
    intendedOutcomeNotes !== undefined &&
    intendedOutcomeNotes !== null &&
    typeof intendedOutcomeNotes !== "string"
  ) {
    return NextResponse.json({ error: "intendedOutcomeNotes must be a string if provided." }, { status: 400 });
  }
  if (
    estimatedValueCents !== undefined &&
    estimatedValueCents !== null &&
    typeof estimatedValueCents !== "number"
  ) {
    return NextResponse.json({ error: "estimatedValueCents must be a number if provided." }, { status: 400 });
  }
  if (currency !== undefined && currency !== null && typeof currency !== "string") {
    return NextResponse.json({ error: "currency must be a string if provided." }, { status: 400 });
  }

  const service = new AssetService(new SupabaseDigitalAssetRepository(session.supabase));
  try {
    await getAssetScopedToEstate(service, id, assetId);
    const asset = await service.updateAsset(assetId, {
      category: category as AssetCategory | undefined,
      providerId: providerId as string | null | undefined,
      customProviderName: customProviderName as string | null | undefined,
      accountIdentifier: accountIdentifier as string | null | undefined,
      intendedOutcome: intendedOutcome as never,
      intendedOutcomeNotes: intendedOutcomeNotes as string | null | undefined,
      estimatedValueCents: estimatedValueCents as number | null | undefined,
      currency: currency as string | null | undefined,
    });
    return NextResponse.json({ asset });
  } catch (error) {
    return assetErrorResponse(error);
  }
}

/**
 * Archive, never hard-delete (Database Schema §4.1 — archived_at is the
 * only removal mechanism; account_closure_requests may reference an asset
 * later, and hard-deleting it would break that history).
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, assetId } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AssetService(new SupabaseDigitalAssetRepository(session.supabase));
  try {
    await getAssetScopedToEstate(service, id, assetId);
    const asset = await service.archiveAsset(assetId);
    return NextResponse.json({ asset });
  } catch (error) {
    return assetErrorResponse(error);
  }
}
