import Link from "next/link";
import { AdminProviderService } from "@/domain/admin-providers/admin-provider-service";
import { SupabaseAdminProviderRepository } from "@/infrastructure/admin-providers/supabase-admin-provider-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { ProvidersAdminClient } from "./providers-admin-client";

export default async function AdminProvidersPage() {
  const supabase = await requirePlatformAdminForPage();
  const service = new AdminProviderService(new SupabaseAdminProviderRepository(supabase));
  const providers = await service.listProviders();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/admin" className="text-sm underline">
        &larr; Admin
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Providers</h1>
      <ProvidersAdminClient initialProviders={providers} />
    </main>
  );
}
