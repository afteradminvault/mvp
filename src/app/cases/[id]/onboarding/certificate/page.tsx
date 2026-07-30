import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { OnboardingStepper } from "../onboarding-stepper";
import { CertificateForm } from "./certificate-form";

/**
 * US-2.3 — death certificate upload, "during or after onboarding." Never
 * blocks onboarding completion (see CertificateForm's Skip action) — it's
 * only here so verification has what it needs when the time comes, not a
 * gate like activate_executor()'s own certificate requirement is.
 */
export default async function OnboardingCertificatePage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <OnboardingStepper currentStepKey="certificate" />
      <h1 className="mb-2 text-2xl font-semibold">Death certificate</h1>
      <p className="mb-6 text-sm text-gray-600">
        {estate.deceasedDateOfDeath
          ? "If you already have a copy, add it now — it's stored securely and picked up automatically once verification starts."
          : "You're setting this up in advance, so there's nothing to add yet. You (or whoever needs to) can come back and upload it later."}
      </p>
      <CertificateForm caseId={id} />
    </main>
  );
}
