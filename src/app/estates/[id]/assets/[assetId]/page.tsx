import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssetNotFoundError, AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { ArchiveAssetButton } from "./archive-asset-button";
import { EditAssetForm } from "./edit-asset-form";
import { VaultItemsSection } from "./vault-items-section";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string; assetId: string }>;
}) {
  const { id, assetId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const service = new AssetService(new SupabaseDigitalAssetRepository(supabase));
  const asset = await service.getAsset(assetId).catch((error: unknown) => {
    if (error instanceof AssetNotFoundError) {
      notFound();
    }
    throw error;
  });
  if (asset.estateId !== id) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Link href={`/estates/${id}/assets`} className="text-sm underline">
        &larr; Digital assets
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">
        {asset.customProviderName ?? asset.providerId ?? "Unnamed asset"}
      </h1>
      <dl className="mb-6 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-600">Category</dt>
        <dd>{asset.category}</dd>
        <dt className="text-gray-600">Account identifier</dt>
        <dd>{asset.accountIdentifier ?? "—"}</dd>
        <dt className="text-gray-600">Intended outcome</dt>
        <dd>{asset.intendedOutcome}</dd>
        <dt className="text-gray-600">Status</dt>
        <dd>{asset.archivedAt ? `Archived ${new Date(asset.archivedAt).toLocaleDateString()}` : "Active"}</dd>
      </dl>

      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-medium">Edit</h2>
        <EditAssetForm estateId={id} asset={asset} />
      </div>

      <div className="mt-10 border-t border-gray-200 pt-6">
        <VaultItemsSection estateId={id} assetId={asset.id} />
      </div>

      {!asset.archivedAt && (
        <div className="mt-10 border-t border-gray-200 pt-6">
          <ArchiveAssetButton estateId={id} assetId={asset.id} />
        </div>
      )}
    </main>
  );
}
