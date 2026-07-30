import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { WillService } from "@/domain/wills/will-service";
import { SupabaseWillRepository } from "@/infrastructure/wills/supabase-will-repository";
import { AdminWillExecutionRequirementService } from "@/domain/admin-will-execution-requirements/admin-will-execution-requirement-service";
import { SupabaseAdminWillExecutionRequirementRepository } from "@/infrastructure/admin-will-execution-requirements/supabase-admin-will-execution-requirement-repository";
import { AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { BeneficiaryService } from "@/domain/beneficiaries/beneficiary-service";
import { SupabaseBeneficiaryRepository } from "@/infrastructure/beneficiaries/supabase-beneficiary-repository";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { WillWizardClient } from "./will-wizard-client";

/** Will Builder epic — only reachable for a self-planned Case. */
export default async function WillPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (!estate.isSelfPlanned) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Link href={`/estates/${id}`} className="text-sm underline">
          &larr; {estate.displayName}
        </Link>
        <p className="mt-6 text-sm text-gray-600">
          This Case isn&apos;t set up for self-planning, so it can&apos;t have a Will attached. Wills are only
          available for a Case you started about yourself — see{" "}
          <Link href="/wills/new" className="underline">
            Start your Will
          </Link>
          .
        </p>
      </main>
    );
  }

  const willService = new WillService(
    new SupabaseWillRepository(supabase),
    new SupabaseEstateRepository(supabase),
    new SupabaseAdminWillExecutionRequirementRepository(supabase),
    new SupabaseDigitalAssetRepository(supabase),
    new SupabaseBeneficiaryRepository(supabase),
    new SupabaseDocumentRepository(supabase),
  );
  const will = await willService.getOrCreateWill(id);
  const bequests = await willService.listBequests(will.id);

  const executionRequirementService = new AdminWillExecutionRequirementService(
    new SupabaseAdminWillExecutionRequirementRepository(supabase),
  );
  const executionRequirements = await executionRequirementService.listRequirements({
    jurisdictionId: estate.jurisdictionId,
  });

  const assetService = new AssetService(new SupabaseDigitalAssetRepository(supabase));
  const beneficiaryService = new BeneficiaryService(
    new SupabaseBeneficiaryRepository(supabase),
    new SupabaseDigitalAssetRepository(supabase),
  );
  const [assets, beneficiaries] = await Promise.all([
    assetService.listAssets(id),
    beneficiaryService.listBeneficiaries(id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}`} className="text-sm underline">
        &larr; {estate.displayName}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Your Will</h1>

      <WillWizardClient
        estateId={id}
        will={will}
        initialBequests={bequests}
        executionRequirement={executionRequirements[0] ?? null}
        assets={assets.map((asset) => ({ id: asset.id, label: asset.customProviderName ?? asset.category }))}
        beneficiaries={beneficiaries.map((beneficiary) => ({ id: beneficiary.id, label: beneficiary.displayName }))}
      />
    </main>
  );
}
