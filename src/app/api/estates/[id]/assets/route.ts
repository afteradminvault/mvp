import { NextResponse } from "next/server";
import { AssetService } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { assetErrorResponse } from "@/app/api/_lib/asset-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Access control note: unlike GET /api/estates/:id, this endpoint doesn't
 * separately verify the caller is a member of estate :id before listing —
 * an estate a non-member queries this way simply returns an empty list via
 * digital_assets_select_member (RLS), never someone else's data. This
 * matches the existing estates routes' reliance on RLS as the actual
 * access-control boundary (Security Architecture §3.2), not a gap.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const includeArchived = url.searchParams.get("archived") === "true";

  const service = new AssetService(new SupabaseDigitalAssetRepository(session.supabase));
  try {
    const assets = await service.listAssets(id, {
      category: category === null ? undefined : (category as AssetCategory),
      includeArchived,
    });
    return NextResponse.json({ assets });
  } catch (error) {
    return assetErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
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

  if (typeof category !== "string") {
    return NextResponse.json({ error: "category is a required string." }, { status: 400 });
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
    const asset = await service.createAsset(id, {
      category: category as AssetCategory,
      providerId: providerId as string | null | undefined,
      customProviderName: customProviderName as string | null | undefined,
      accountIdentifier: accountIdentifier as string | null | undefined,
      intendedOutcome: intendedOutcome as never,
      intendedOutcomeNotes: intendedOutcomeNotes as string | null | undefined,
      estimatedValueCents: estimatedValueCents as number | null | undefined,
      currency: currency as string | null | undefined,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return assetErrorResponse(error);
  }
}
