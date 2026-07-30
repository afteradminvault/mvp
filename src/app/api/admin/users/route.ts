import { NextResponse } from "next/server";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** US-8.2 — search/filter/view (users_select_admin RLS scopes this to platform admins). */
export async function GET(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const service = new AdminUserService(new SupabaseAdminUserRepository(session.supabase));
  try {
    const result = await service.listUsers({
      search: searchParams.get("search") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
