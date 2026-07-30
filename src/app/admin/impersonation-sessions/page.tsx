import Link from "next/link";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { ImpersonationSessionsClient } from "./impersonation-sessions-client";

/** US-8.2 — where an admin ends a session, from their own still-authenticated-as-themselves browser context (see the end route's own comment). */
export default async function ImpersonationSessionsPage() {
  const supabase = await requirePlatformAdminForPage();

  const service = new AdminUserService(new SupabaseAdminUserRepository(supabase));
  const sessions = await service.listImpersonationSessions();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/admin/users" className="text-sm underline">
        &larr; Users
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Impersonation sessions</h1>

      <ImpersonationSessionsClient initialSessions={sessions} />
    </main>
  );
}
