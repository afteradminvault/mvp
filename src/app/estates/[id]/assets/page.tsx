import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssetService } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

const CATEGORIES: AssetCategory[] = [
  "financial",
  "social",
  "subscription",
  "crypto",
  "cloud_storage",
  "domain",
  "other",
];

export default async function AssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string; archived?: string }>;
}) {
  const { id } = await params;
  const { category, archived } = await searchParams;
  const includeArchived = archived === "true";

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
  const membershipService = new MembershipService(new SupabaseMembershipRepository(supabase));
  const [assets, members] = await Promise.all([
    assetService.listAssets(id, {
      category: category as AssetCategory | undefined,
      includeArchived,
    }),
    membershipService.listMembers(id),
  ]);
  const isOwner = members.find((member) => member.userId === user.id)?.role === "family";

  function filterHref(nextCategory?: string) {
    const query = new URLSearchParams();
    if (nextCategory) query.set("category", nextCategory);
    if (includeArchived) query.set("archived", "true");
    const queryString = query.toString();
    return `/estates/${id}/assets${queryString ? `?${queryString}` : ""}`;
  }

  function archivedToggleHref() {
    const query = new URLSearchParams();
    if (category) query.set("category", category);
    if (!includeArchived) query.set("archived", "true");
    const queryString = query.toString();
    return `/estates/${id}/assets${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/estates/${id}`} className="text-sm underline">
            &larr; {estate.displayName}
          </Link>
          <h1 className="text-2xl font-semibold">Digital assets</h1>
        </div>
        {isOwner && (
          <Link href={`/estates/${id}/assets/new`} className="rounded bg-black px-4 py-2 text-sm text-white">
            + Add asset
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={filterHref()} className={!category ? "font-semibold underline" : "underline"}>
          All
        </Link>
        {CATEGORIES.map((cat) => (
          <Link key={cat} href={filterHref(cat)} className={category === cat ? "font-semibold underline" : "underline"}>
            {cat}
          </Link>
        ))}
        <Link href={archivedToggleHref()} className="ml-auto underline">
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-gray-600">No assets yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {assets.map((asset) => (
            <li key={asset.id} className="rounded border border-gray-300 p-4">
              <Link href={`/estates/${id}/assets/${asset.id}`} className="font-medium underline">
                {asset.customProviderName ?? asset.providerId ?? "Unnamed asset"}
              </Link>
              <p className="text-sm text-gray-600">
                {asset.category} &middot; {asset.intendedOutcome}
                {asset.archivedAt ? " · archived" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
