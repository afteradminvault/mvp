import { redirect } from "next/navigation";
import { EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { CreateEstateForm } from "./create-estate-form";

export default async function NewEstatePage() {
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
      <h1 className="mb-6 text-2xl font-semibold">Create your estate</h1>
      <CreateEstateForm jurisdictions={jurisdictions} />
    </main>
  );
}
