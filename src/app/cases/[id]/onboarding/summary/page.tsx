import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { AssetService } from "@/domain/assets/asset-service";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { MembershipService } from "@/domain/membership/membership-service";
import { SupabaseMembershipRepository } from "@/infrastructure/membership/supabase-membership-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

/**
 * US-2.6 — shown right after onboarding completes (draft -> active_living,
 * via the confirm step's Complete setup button). "Ends with one clear
 * primary action, not three competing ones" — that's inviting an
 * Executor if none exists yet, or going to the Case otherwise.
 */
export default async function OnboardingSummaryPage({ params }: { params: Promise<{ id: string }> }) {
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

  const assetService = new AssetService(new SupabaseDigitalAssetRepository(supabase));
  const documentService = new DocumentService(new SupabaseDocumentRepository(supabase));
  const membershipService = new MembershipService(new SupabaseMembershipRepository(supabase));
  const [assets, documents, members] = await Promise.all([
    assetService.listAssets(id),
    documentService.listDocuments(id),
    membershipService.listMembers(id),
  ]);
  const hasDeathCertificate = documents.some((doc) => doc.documentType === "death_certificate");
  const executorInvited = members.some((member) => member.role === "executor");

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">{estate.displayName} is set up</h1>
      <p className="mb-6 text-sm text-gray-600">
        Here&apos;s where things stand, and what&apos;s worth doing next.
      </p>

      <ul className="mb-8 flex flex-col gap-3 text-sm">
        <li className="rounded border border-gray-300 p-3">
          <p className="font-medium">{assets.length} account{assets.length === 1 ? "" : "s"} tracked</p>
          <p className="text-gray-600">Add more anytime from the Case page.</p>
        </li>
        <li className="rounded border border-gray-300 p-3">
          <p className="font-medium">Death certificate {hasDeathCertificate ? "on file" : "still needed"}</p>
          <p className="text-gray-600">
            {hasDeathCertificate
              ? "This will be picked up automatically once verification starts."
              : "Needed before an Executor can gain vault access — add it whenever it's ready."}
          </p>
        </li>
        <li className="rounded border border-gray-300 p-3">
          <p className="font-medium">Executor {executorInvited ? "invited" : "not invited yet"}</p>
          <p className="text-gray-600">
            {executorInvited
              ? "They'll gain access once the death is verified."
              : "Whoever should act on this Case's behalf needs to be invited."}
          </p>
        </li>
      </ul>

      <Link
        href={executorInvited ? `/estates/${id}` : `/estates/${id}/members`}
        className="block rounded bg-black px-4 py-2 text-center text-white"
      >
        {executorInvited ? "Go to your Case" : "Invite an Executor"}
      </Link>
    </main>
  );
}
