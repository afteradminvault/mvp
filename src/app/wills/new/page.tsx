import { redirect } from "next/navigation";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { CreateWillCaseForm } from "./create-will-case-form";

/**
 * Will Builder epic — the dedicated entry point for a self-planned Case
 * (cases.is_self_planned=true), distinct from /cases/new (which is always
 * about someone else — "Their full name" / "Your relationship to them").
 * Here the account holder IS the testator, so there's no relationship
 * question to ask at all.
 */
export default async function NewWillPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("users").select("display_name").eq("id", user.id).single();

  const service = new EstateService(new SupabaseEstateRepository(supabase));
  const jurisdictions = await service.listSupportedJurisdictions();

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Start your Will</h1>
      <p className="mb-6 text-sm text-gray-600">
        This sets up a Case for your own future estate — the same nomination, check-in, and death-reporting
        machinery as every other Case, just about you. Your nominated Executor and any accounts you&apos;ve
        already added can be referenced directly from your Will, instead of re-entering them.
      </p>
      <CreateWillCaseForm jurisdictions={jurisdictions} defaultFullName={(profile as { display_name?: string } | null)?.display_name ?? ""} />
    </main>
  );
}
