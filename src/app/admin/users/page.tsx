import Link from "next/link";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdminForPage } from "../require-platform-admin-page";
import { AdminUsersClient } from "./admin-users-client";

/** US-8.2 — dense admin table: search/filter/view/suspend/impersonate. */
export default async function AdminUsersPage() {
  const supabase = await requirePlatformAdminForPage();

  const service = new AdminUserService(new SupabaseAdminUserRepository(supabase));
  const result = await service.listUsers({});

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm underline">
            &larr; Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Users</h1>
        </div>
        <Link href="/admin/impersonation-sessions" className="text-sm underline">
          Impersonation sessions
        </Link>
      </div>

      <AdminUsersClient initialUsers={result.users} initialTotal={result.total} />
    </main>
  );
}
