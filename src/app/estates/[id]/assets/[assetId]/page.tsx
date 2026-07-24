import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssetNotFoundError, AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { ClosureRequestService } from "@/domain/closure-requests/closure-request-service";
import { SupabaseClosureRequestRepository } from "@/infrastructure/closure-requests/supabase-closure-request-repository";
import { SupabaseAdminLegalRequirementRepository } from "@/infrastructure/admin-legal-requirements/supabase-admin-legal-requirement-repository";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { ArchiveAssetButton } from "./archive-asset-button";
import { EditAssetForm } from "./edit-asset-form";
import { VaultItemsSection } from "./vault-items-section";
import { ExecutorVaultItemsSection } from "./executor-vault-items-section";
import { ClosureRequestSection } from "./closure-request-section";

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

  const estateService = new EstateService(new SupabaseEstateRepository(supabase));
  const membershipService = new MembershipService(new SupabaseMembershipRepository(supabase));
  const closureRequestService = new ClosureRequestService(
    new SupabaseClosureRequestRepository(supabase),
    new SupabaseDigitalAssetRepository(supabase),
    new SupabaseEstateRepository(supabase),
    new SupabaseAdminLegalRequirementRepository(supabase),
  );
  const documentService = new DocumentService(new SupabaseDocumentRepository(supabase));
  const [estate, members, allClosureRequests, documents] = await Promise.all([
    estateService.getEstate(id),
    membershipService.listMembers(id),
    closureRequestService.listClosureRequests(id),
    documentService.listDocuments(id),
  ]);
  const closureRequests = allClosureRequests.filter((request) => request.digitalAssetId === assetId);
  const viewerRole = members.find((member) => member.userId === user.id)?.role ?? null;
  const isOwner = viewerRole === "owner";
  const isExecutor = viewerRole === "executor";
  // No `viewerRole === "helper"` branch anywhere below — Helper gets no
  // vault section at all (API Specification §6: "Explicitly no helper
  // access to any vault-items route"), not even a read-only one.

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

      {isOwner && (
        <div className="border-t border-gray-200 pt-6">
          <h2 className="mb-4 text-lg font-medium">Edit</h2>
          <EditAssetForm estateId={id} asset={asset} />
        </div>
      )}

      {isOwner && (
        <div className="mt-10 border-t border-gray-200 pt-6">
          <VaultItemsSection estateId={id} assetId={asset.id} />
        </div>
      )}

      {isExecutor && estate.status === "active_executor" && (
        <div className="mt-10 border-t border-gray-200 pt-6">
          <ExecutorVaultItemsSection estateId={id} assetId={asset.id} />
        </div>
      )}

      <div className="mt-10 border-t border-gray-200 pt-6">
        <ClosureRequestSection
          estateId={id}
          assetId={asset.id}
          initialRequests={closureRequests}
          availableDocuments={documents}
          isExecutor={isExecutor}
        />
      </div>

      {isOwner && !asset.archivedAt && (
        <div className="mt-10 border-t border-gray-200 pt-6">
          <ArchiveAssetButton estateId={id} assetId={asset.id} />
        </div>
      )}
    </main>
  );
}
