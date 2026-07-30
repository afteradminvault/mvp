import { NextResponse } from "next/server";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * US-8.2 — called from the admin's own (still-authenticated-as-themselves)
 * browser context, not from the impersonated tab: once the admin opens the
 * magic link, that browser is authenticated as the target user, not the
 * admin, so it has no way to call a requirePlatformAdmin()-gated route
 * anymore. This is bookkeeping the admin does afterward, from elsewhere.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminUserService(new SupabaseAdminUserRepository(session.supabase));
  try {
    await service.endImpersonation(id);
    await writeAuditLog(session.supabase, {
      estateId: null,
      actorUserId: session.userId,
      eventType: "admin_impersonation_ended",
      targetTable: "admin_impersonation_sessions",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
