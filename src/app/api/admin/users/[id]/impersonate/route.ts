import { NextResponse } from "next/server";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * US-8.2 🔒 — mints a real Supabase session for the target user (see
 * SupabaseAdminUserRepository's own comment on why this needs the
 * service-role client internally). Every session writes its own
 * admin_impersonation_sessions row PLUS this standard audit_logs entry,
 * per the story's own AC. Vault plaintext stays unreachable regardless —
 * see AdminUserService.startImpersonation's own comment and its test.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminUserService(new SupabaseAdminUserRepository(session.supabase));
  try {
    const impersonationSession = await service.startImpersonation(session.userId, id);
    await writeAuditLog(session.supabase, {
      estateId: null,
      actorUserId: session.userId,
      eventType: "admin_impersonation_started",
      targetTable: "users",
      targetId: id,
      metadata: { impersonationSessionId: impersonationSession.id },
    });
    return NextResponse.json({ impersonationSession }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
