import Link from "next/link";
import { AdminJurisdictionService } from "@/domain/admin-jurisdictions/admin-jurisdiction-service";
import { SupabaseAdminJurisdictionRepository } from "@/infrastructure/admin-jurisdictions/supabase-admin-jurisdiction-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { JurisdictionsAdminClient } from "./jurisdictions-admin-client";

export default async function AdminJurisdictionsPage() {
  const supabase = await requirePlatformAdminForPage();
  const service = new AdminJurisdictionService(new SupabaseAdminJurisdictionRepository(supabase));
  const jurisdictions = await service.listJurisdictions();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Jurisdictions</h1>
      <JurisdictionsAdminClient initialJurisdictions={jurisdictions} />
    </main>
  );
}
