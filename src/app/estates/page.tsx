import Link from "next/link";
import { redirect } from "next/navigation";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { SignOutButton } from "./sign-out-button";

export default async function EstatesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const service = new EstateService(new SupabaseEstateRepository(supabase));
  const estates = await service.listMyEstates();

  if (estates.length === 0) {
    redirect("/cases/new");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your estates</h1>
        <div className="flex items-center gap-4">
          {/* /estates/new (create_case(), status starts active_living) still exists and works, just
              no longer linked here — /cases/new (create_draft_case(), PRD v2 §3.2 onboarding) is now
              the primary entry point. See SupabaseEstateRepository's doc comment for why both remain. */}
          <Link href="/cases/new" className="text-sm underline">
            + New Case
          </Link>
          <Link href="/account/mfa" className="text-sm underline">
            Two-factor auth
          </Link>
          <SignOutButton />
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {estates.map((estate) => (
          <li key={estate.id} className="rounded border border-gray-300 p-4">
            <Link href={`/estates/${estate.id}`} className="font-medium underline">
              {estate.displayName}
            </Link>
            <p className="text-sm text-gray-600">Status: {estate.status}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
