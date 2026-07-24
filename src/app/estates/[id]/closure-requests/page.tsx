import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { ASSET_CATEGORIES, AssetService } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { CLOSURE_STATUSES, ClosureRequestService } from "@/domain/closure-requests/closure-request-service";
import type { ClosureStatus } from "@/domain/closure-requests/ports";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * Estate-wide closure-request dashboard (PRD §4.5, Milestone 3 feature 2)
 * — "every asset's request status in one list, filterable by status and
 * category." Server-rendered with query-param filters, same pattern as
 * /estates/[id]/assets, and reuses the existing GET
 * /api/estates/:id/closure-requests filters at the service layer directly
 * rather than round-tripping through the route handler. Role: any accepted
 * member — closure_requests_select_member RLS already enforces this, same
 * as the per-asset closure-request-section.
 */
export default async function ClosureRequestsDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const { id } = await params;
  const { status, category } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const estateService = new EstateService(new SupabaseEstateRepository(supabase));
  const estate = await estateService.getEstate(id).catch((error: unknown) => {
    if (error instanceof EstateNotFoundError) {
      notFound();
    }
    throw error;
  });

  const assetService = new AssetService(new SupabaseDigitalAssetRepository(supabase));
  const closureRequestService = new ClosureRequestService(
    new SupabaseClosureRequestRepository(supabase),
    new SupabaseDigitalAssetRepository(supabase),
    new SupabaseEstateRepository(supabase),
    new SupabaseAdminLegalRequirementRepository(supabase),
  );

  const [assets, closureRequests] = await Promise.all([
    assetService.listAssets(id, { includeArchived: true }),
    closureRequestService.listClosureRequests(id, {
      status: status as ClosureStatus | undefined,
      category: category as AssetCategory | undefined,
    }),
  ]);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  function statusHref(nextStatus?: string) {
    const query = new URLSearchParams();
    if (nextStatus) query.set("status", nextStatus);
    if (category) query.set("category", category);
    const queryString = query.toString();
    return `/estates/${id}/closure-requests${queryString ? `?${queryString}` : ""}`;
  }

  function categoryHref(nextCategory?: string) {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (nextCategory) query.set("category", nextCategory);
    const queryString = query.toString();
    return `/estates/${id}/closure-requests${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6">
        <Link href={`/estates/${id}`} className="text-sm underline">
          &larr; {estate.displayName}
        </Link>
        <h1 className="text-2xl font-semibold">Account closures</h1>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Status:</span>
        <Link href={statusHref()} className={!status ? "font-semibold underline" : "underline"}>
          All
        </Link>
        {CLOSURE_STATUSES.map((s) => (
          <Link key={s} href={statusHref(s)} className={status === s ? "font-semibold underline" : "underline"}>
            {s}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Category:</span>
        <Link href={categoryHref()} className={!category ? "font-semibold underline" : "underline"}>
          All
        </Link>
        {ASSET_CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={categoryHref(cat)}
            className={category === cat ? "font-semibold underline" : "underline"}
          >
            {cat}
          </Link>
        ))}
      </div>

      {closureRequests.length === 0 ? (
        <p className="text-sm text-gray-600">No closure requests match this filter.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {closureRequests.map((request) => {
            const asset = assetsById.get(request.digitalAssetId);
            return (
              <li key={request.id} className="rounded border border-gray-300 p-4">
                <Link href={`/estates/${id}/assets/${request.digitalAssetId}`} className="font-medium underline">
                  {asset?.customProviderName ?? asset?.providerId ?? "Unknown asset"}
                </Link>
                <p className="text-sm text-gray-600">
                  {asset?.category ?? "—"} &middot; {request.status}
                </p>
                <p className="text-xs text-gray-500">
                  Last status change {new Date(request.lastStatusChangeAt).toLocaleString()}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
