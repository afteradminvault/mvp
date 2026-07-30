import { redirect } from "next/navigation";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { CreateCaseForm } from "./create-case-form";

/**
 * Onboarding step 1 (PRD v2 §3.2, US-2.1) — the new primary entry point
 * for opening a Case, replacing /estates/new going forward (that route/
 * page are untouched, just no longer linked to from /estates — see that
 * page's own comment).
 */
export default async function NewCasePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const service = new EstateService(new SupabaseEstateRepository(supabase));
  const jurisdictions = await service.listSupportedJurisdictions();

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Start a Case</h1>
      <p className="mb-6 text-sm text-gray-600">
        A Case holds everything related to one person&apos;s digital life — accounts, documents, and
        instructions for whoever needs to act on their behalf. You can fill this in for someone who has
        already passed, or set it up in advance for yourself or a loved one.
      </p>
      <CreateCaseForm jurisdictions={jurisdictions} />
    </main>
  );
}
