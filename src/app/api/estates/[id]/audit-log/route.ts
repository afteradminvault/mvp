import { NextResponse } from "next/server";
import { AuditLogService } from "@/domain/audit-logs/audit-log-service";
import { SupabaseAuditLogRepository } from "@/infrastructure/audit-logs/supabase-audit-log-repository";
import { requireSession } from "@/app/api/_lib/require-session";
import { auditLogErrorResponse } from "@/app/api/_lib/audit-log-error-response";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Paginated, filterable by event_type and date range (API Specification
 * §13) — the dispute-resolution/trust-building view referenced in Security
 * Architecture §3.3. Role: owner or executor, enforced entirely by
 * audit_logs_select_owner_or_executor RLS (already in place from the
 * initial schema migration; no new migration needed for this feature) — a
 * Helper querying this simply gets an empty result, same as every other
 * RLS-gated list in this codebase, not a 403.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await requireSession();
  if ("unauthorized" in session) return session.unauthorized;

  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("eventType") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const limit = searchParams.get("limit") ?? undefined;
  const offset = searchParams.get("offset") ?? undefined;

  const service = new AuditLogService(new SupabaseAuditLogRepository(session.supabase));
  try {
    const result = await service.listAuditLogs(id, { eventType, from, to, limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    return auditLogErrorResponse(error);
  }
}
