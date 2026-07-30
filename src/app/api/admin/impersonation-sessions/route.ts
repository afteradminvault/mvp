import { NextResponse } from "next/server";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** US-8.2 — history/active-session list, so an admin can see (and end) sessions from their own separate authenticated context. Never includes actionLink (one-time, already spent or expired). */
export async function GET() {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminUserService(new SupabaseAdminUserRepository(session.supabase));
  try {
    const sessions = await service.listImpersonationSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
