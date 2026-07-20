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
    redirect("/estates/new");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your estates</h1>
        <div className="flex items-center gap-4">
          <Link href="/estates/new" className="text-sm underline">
            + New estate
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
