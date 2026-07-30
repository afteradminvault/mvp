import { NextResponse } from "next/server";
import { AdminUserService } from "@/domain/admin-users/admin-user-service";
import { SupabaseAdminUserRepository } from "@/infrastructure/admin-users/supabase-admin-user-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";
import { writeAuditLog } from "@/app/api/_lib/audit-log";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminUserService(new SupabaseAdminUserRepository(session.supabase));
  try {
    const user = await service.getUser(id);
    return NextResponse.json({ user });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

/** US-8.2 — suspend/unsuspend. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { suspended } = body as Record<string, unknown>;

  const service = new AdminUserService(new SupabaseAdminUserRepository(session.supabase));
  try {
    const user = await service.setSuspended(id, suspended);
    await writeAuditLog(session.supabase, {
      estateId: null,
      actorUserId: session.userId,
      eventType: user.suspendedAt ? "admin_user_suspended" : "admin_user_unsuspended",
      targetTable: "users",
      targetId: id,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
