import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { PlatformService } from "@/domain/platforms/platform-service";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { ASSET_CATEGORIES } from "@/domain/assets/asset-service";
import type { AssetCategory } from "@/domain/assets/ports";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * US-5.1 — search/browse the platform catalog. Server-rendered with
 * query-param filters, same pattern as the closure-requests dashboard.
 */
export default async function PlatformsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; category?: string }>;
}) {
  const { id } = await params;
  const { search, category } = await searchParams;

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

  const platformService = new PlatformService(new SupabasePlatformRepository(supabase));
  const platforms = await platformService.searchPlatforms({ search, category });

  function categoryHref(nextCategory?: string) {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (nextCategory) query.set("category", nextCategory);
    const queryString = query.toString();
    return `/estates/${id}/platforms${queryString ? `?${queryString}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}`} className="text-sm underline">
        &larr; {estate.displayName}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Platform directory</h1>

      <form className="mb-3 flex gap-2" action={`/estates/${id}/platforms`}>
        {category && <input type="hidden" name="category" value={category} />}
        <input
          type="text"
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by name (e.g. Chase, Netflix)"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
          Search
        </button>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Category:</span>
        <Link href={categoryHref()} className={!category ? "font-semibold underline" : "underline"}>
          All
        </Link>
        {ASSET_CATEGORIES.map((cat: AssetCategory) => (
          <Link key={cat} href={categoryHref(cat)} className={category === cat ? "font-semibold underline" : "underline"}>
            {cat}
          </Link>
        ))}
      </div>

      {platforms.length === 0 ? (
        <p className="text-sm text-gray-600">No platforms match this search.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {platforms.map((platform) => (
            <li key={platform.id} className="rounded border border-gray-300 p-3 text-sm">
              <Link href={`/estates/${id}/platforms/${platform.id}`} className="font-medium underline">
                {platform.name}
              </Link>
              <p className="text-gray-600">
                {platform.defaultCategory}
                {platform.closureMethod ? ` · closure via ${platform.closureMethod.replace("_", " ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
