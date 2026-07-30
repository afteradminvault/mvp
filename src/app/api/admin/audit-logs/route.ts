import { NextResponse } from "next/server";
import { AuditLogService } from "@/domain/audit-logs/audit-log-service";
import { SupabaseAuditLogRepository } from "@/infrastructure/audit-logs/supabase-audit-log-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** US-8.7 — system-wide (not per-case) view, filterable by event_type/actor/date range (audit_logs_select_admin RLS scopes this to platform admins). */
export async function GET(request: Request) {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const service = new AuditLogService(new SupabaseAuditLogRepository(session.supabase));
  try {
    const result = await service.listAllAuditLogs({
      eventType: searchParams.get("eventType") ?? undefined,
      actorUserId: searchParams.get("actorUserId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
