import { NextResponse } from "next/server";
import { AdminMetricService } from "@/domain/admin-metrics/admin-metric-service";
import { SupabaseAdminMetricsRepository } from "@/infrastructure/admin-metrics/supabase-admin-metrics-repository";
import { requirePlatformAdmin } from "@/app/api/_lib/require-platform-admin";
import { adminErrorResponse } from "@/app/api/_lib/admin-error-response";

/** US-8.1 — aggregate counts only (get_admin_overview_metrics() enforces this structurally, see the migration's own comment). */
export async function GET() {
  const session = await requirePlatformAdmin();
  if ("unauthorized" in session) return session.unauthorized;

  const service = new AdminMetricService(new SupabaseAdminMetricsRepository(session.supabase));
  try {
    const metrics = await service.getOverviewMetrics();
    return NextResponse.json({ metrics });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
