import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { OnboardingStepper } from "../onboarding-stepper";
import { CompleteSetupButton } from "./complete-setup-button";

/** The final onboarding step — review, then activate_draft_case() (US-2.5's confirmation email fires from that route). */
export default async function OnboardingConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  if (estate.ownerUserId !== user.id) {
    redirect(`/estates/${id}`);
  }
  if (estate.status !== "draft") {
    redirect(`/estates/${id}`);
  }

  const assetService = new AssetService(new SupabaseDigitalAssetRepository(supabase));
  const documentService = new DocumentService(new SupabaseDocumentRepository(supabase));
  const [assets, documents] = await Promise.all([assetService.listAssets(id), documentService.listDocuments(id)]);
  const hasDeathCertificate = documents.some((doc) => doc.documentType === "death_certificate");

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <OnboardingStepper currentStepKey="confirm" />
      <h1 className="mb-2 text-2xl font-semibold">Review &amp; finish</h1>
      <p className="mb-6 text-sm text-gray-600">
        Here&apos;s what you&apos;ve set up so far — you can add more later, nothing here is final.
      </p>

      <dl className="mb-6 flex flex-col gap-3 text-sm">
        <div className="rounded border border-gray-300 p-3">
          <dt className="text-gray-600">For</dt>
          <dd className="font-medium">
            {estate.deceasedFullName} &middot; {estate.deceasedRelationship}
          </dd>
        </div>
        <div className="rounded border border-gray-300 p-3">
          <dt className="text-gray-600">Accounts tracked</dt>
          <dd className="font-medium">{assets.length}</dd>
        </div>
        <div className="rounded border border-gray-300 p-3">
          <dt className="text-gray-600">Death certificate</dt>
          <dd className="font-medium">{hasDeathCertificate ? "On file" : "Not added yet"}</dd>
        </div>
      </dl>

      <CompleteSetupButton caseId={id} />
    </main>
  );
}
