import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { PlatformService } from "@/domain/platforms/platform-service";
import { SupabasePlatformRepository } from "@/infrastructure/platforms/supabase-platform-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { OnboardingStepper } from "../onboarding-stepper";
import { ChecklistForm } from "./checklist-form";

/** US-2.4 — the pre-populated platform checklist onboarding step. */
export default async function OnboardingChecklistPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Onboarding is an owner-only flow — a case only ever has one 'family'
  // member (its creator) reachable this way today, see
  // case_members_one_owner_idx's own comment.
  if (estate.ownerUserId !== user.id) {
    redirect(`/estates/${id}`);
  }
  if (estate.status !== "draft") {
    redirect(`/estates/${id}`);
  }

  const platformService = new PlatformService(new SupabasePlatformRepository(supabase));
  const platforms = await platformService.listCommonOnboardingPlatforms();
  const checkedPlatformIds = Array.isArray(estate.draftPayload.checklist)
    ? (estate.draftPayload.checklist as string[])
    : [];

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <OnboardingStepper currentStepKey="checklist" />
      <h1 className="mb-2 text-2xl font-semibold">Accounts to track</h1>
      <p className="mb-6 text-sm text-gray-600">
        Check anything {estate.deceasedFullName ?? "they"} likely had an account with. This just gives you a
        starting list — you can add, remove, or skip anything here later.
      </p>
      <ChecklistForm caseId={id} platforms={platforms} initialCheckedPlatformIds={checkedPlatformIds} />
    </main>
  );
}
